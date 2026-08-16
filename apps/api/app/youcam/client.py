"""Live YouCam / Perfect Corp YCE client (s2s v2). No mock path."""

from __future__ import annotations

import asyncio
import io
import json
import logging
import time
import zipfile
from pathlib import Path
from typing import Any, Optional

import httpx
from PIL import Image

from app.core.config import Settings, get_settings
from app.core.schemas import ColorSwatch, ConcernScore

logger = logging.getLogger(__name__)

DEFAULT_HOST = "https://yce-api-01.makeupar.com"
FILE_PATH = "/s2s/v2.0/file"

SD_SKIN_ACTIONS = [
    "wrinkle",
    "pore",
    "texture",
    "acne",
    "oiliness",
    "radiance",
    "eye_bag",
    "age_spot",
    "dark_circle_v2",
    "droopy_upper_eyelid",
    "droopy_lower_eyelid",
    "firmness",
    "moisture",
    "redness",
    "tear_trough",
    "skin_type",
]

# YouCam ui_score is "healthier is higher". Our fusion treats these as problem intensity.
INVERT_CONCERNS = {
    "acne",
    "wrinkle",
    "pore",
    "redness",
    "oiliness",
    "dark_circle",
    "dark_circle_v2",
    "eye_bag",
    "spot",
    "age_spot",
    "droopy_upper_eyelid",
    "droopy_lower_eyelid",
    "tear_trough",
}

CONCERN_ALIASES = {
    "dark_circle_v2": "dark_circle",
    "age_spot": "spot",
}

CONCERN_KEYS = [
    "acne",
    "wrinkle",
    "pore",
    "redness",
    "oiliness",
    "moisture",
    "texture",
    "radiance",
    "dark_circle",
    "eye_bag",
    "firmness",
    "spot",
    "droopy_upper_eyelid",
    "droopy_lower_eyelid",
]


class YouCamError(RuntimeError):
    pass


class YouCamClient:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.base = _normalize_base(self.settings.youcam_base_url)
        self.key = self.settings.youcam_api_key
        self.secret = self.settings.youcam_api_secret

    def _require_key(self) -> None:
        if not self.key:
            raise YouCamError("YOUCAM_API_KEY is required. Add it to .env.")

    def _headers(self, json_content: bool = True) -> dict[str, str]:
        self._require_key()
        headers = {"Authorization": f"Bearer {self.key}"}
        if json_content:
            headers["Content-Type"] = "application/json"
        return headers

    async def analyze_skin(self, image_path: Path) -> dict[str, Any]:
        last_err: Exception | None = None
        for tightness in (0.56, 0.42, 0.32):
            file_id = await self._upload(image_path, face_tightness=tightness)
            try:
                return await self._run_skin(file_id)
            except YouCamError as exc:
                last_err = exc
                if not _is_face_too_small(exc):
                    raise
        raise last_err or YouCamError("skin-analysis failed")

    async def analyze_color_tone(self, image_path: Path) -> dict[str, Any]:
        file_id = await self._upload(image_path, face_tightness=None)
        return await self._run_color(file_id)

    async def analyze_fitzpatrick(self, image_path: Path) -> dict[str, Any]:
        file_id = await self._upload(image_path, face_tightness=None)
        return await self._run_fitz(file_id)

    async def full_profile_bundle(self, image_path: Path) -> dict[str, Any]:
        # Skin Analysis needs a tight face crop; color/Fitzpatrick prefer the full frame.
        skin_id, wide_id = await asyncio.gather(
            self._upload(image_path, face_tightness=0.56),
            self._upload(image_path, face_tightness=None),
        )
        skin, color, fitz = await asyncio.gather(
            self._run_skin(skin_id),
            self._run_color(wide_id),
            self._run_fitz(wide_id),
            return_exceptions=True,
        )
        if isinstance(skin, Exception) and _is_face_too_small(skin):
            for tightness in (0.42, 0.32):
                tighter = await self._upload(image_path, face_tightness=tightness)
                try:
                    skin = await self._run_skin(tighter)
                    break
                except YouCamError as exc:
                    skin = exc
                    if not _is_face_too_small(exc):
                        break
        bundle: dict[str, Any] = {}
        errors: list[str] = []
        for key, result in (("skin", skin), ("color", color), ("fitzpatrick", fitz)):
            if isinstance(result, Exception):
                detail = f"{type(result).__name__}: {result or repr(result)}"
                errors.append(f"{key}: {detail}")
                logger.warning("YouCam %s failed: %s", key, detail)
                bundle[key] = {"error": detail}
            else:
                bundle[key] = result
        if errors and all(isinstance(x, Exception) for x in (skin, color, fitz)):
            raise YouCamError("; ".join(errors))
        if errors:
            bundle["partial_errors"] = errors
        return bundle

    async def vto_apparel(
        self,
        person_path: Path,
        garment_path: Path,
        category: str = "clothes",
    ) -> dict[str, Any]:
        src_id, ref_id = await asyncio.gather(
            self._upload(person_path),
            self._upload(garment_path),
        )
        payload = {
            "src_file_id": src_id,
            "ref_file_id": ref_id,
            "garment_category": _garment_category(category),
        }
        action = self.settings.youcam_clothes_action.strip() or "cloth-v3"
        try:
            task_id = await self._create_task(action, payload)
        except YouCamError:
            # A failed task-creation request does not create a billable VTO task.
            # This preserves compatibility with an existing local account while
            # making the documented public action the default.
            fallback = self.settings.youcam_clothes_fallback_action.strip()
            if not fallback or fallback == action:
                raise
            logger.warning("YouCam Clothes action %s failed; trying %s", action, fallback)
            action = fallback
            task_id = await self._create_task(action, payload)
        return await self._poll(action, task_id)

    async def poll_task(self, task_id: str, timeout_s: float = 90.0) -> dict[str, Any]:
        return await self._poll("skin-analysis", task_id, timeout_s)

    async def _run_skin(self, file_id: str) -> dict[str, Any]:
        try:
            task_id = await self._create_task(
                "skin-analysis",
                {
                    "src_file_id": file_id,
                    "dst_actions": SD_SKIN_ACTIONS,
                    "format": "json",
                },
            )
            data = await self._poll("skin-analysis", task_id)
        except YouCamError:
            raise
        except Exception as exc:
            raise YouCamError(f"skin-analysis crashed: {type(exc).__name__}: {exc or repr(exc)}") from exc
        if _skin_has_scores(data):
            return data
        raise YouCamError("skin-analysis returned no scores")

    async def _inflate_skin_zip(self, data: dict[str, Any]) -> dict[str, Any]:
        results = data.get("results") if isinstance(data.get("results"), dict) else {}
        url = None
        for key in ("url", "zip_url", "result_url", "file_url"):
            val = results.get(key)
            if isinstance(val, str) and val.startswith("http"):
                url = val
                break
        if not url:
            return data
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url)
            if r.status_code >= 400:
                raise YouCamError(f"Skin zip download {r.status_code}")
            payload = r.content
        return {**data, "results": score_info_to_results(_read_score_info(payload))}

    async def _run_color(self, file_id: str) -> dict[str, Any]:
        task_id = await self._create_task(
            "skin-tone-analysis",
            {
                "src_file_id": file_id,
                "face_angle_strictness_level": "flexible",
            },
        )
        return await self._poll("skin-tone-analysis", task_id)

    async def _run_fitz(self, file_id: str) -> dict[str, Any]:
        task_id = await self._create_task(
            "fitzpatrick-scale-analyzer",
            {"src_file_id": file_id, "version": "1.0", "index": 0},
        )
        return await self._poll("fitzpatrick-scale-analyzer", task_id)

    async def _upload(self, image_path: Path, face_tightness: float | None = None) -> str:
        blob, content_type, file_name = _jpeg_bytes(image_path, face_tightness=face_tightness)
        headers = self._headers()
        body = {
            "files": [
                {
                    "content_type": content_type,
                    "file_name": file_name,
                    "file_size": len(blob),
                }
            ]
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(f"{self.base}{FILE_PATH}", headers=headers, json=body)
            data = _json(r)
            if r.status_code >= 400:
                raise YouCamError(f"File API {r.status_code}: {_err_text(data)}")
            item = _first_file(data)
            if not item:
                raise YouCamError(f"File API returned no file entry: {list(data.keys())}")
            file_id = item.get("file_id") or item.get("id")
            reqs = item.get("requests") or []
            if not file_id or not reqs:
                raise YouCamError("File API missing file_id or upload URL")
            req0 = reqs[0]
            url = req0.get("url")
            method = str(req0.get("method") or "PUT").upper()
            up_headers = dict(req0.get("headers") or {})
            if method == "PUT":
                up = await client.put(url, content=blob, headers=up_headers)
            else:
                up = await client.post(url, content=blob, headers=up_headers)
            if up.status_code >= 400:
                raise YouCamError(f"Presigned upload {up.status_code}: {up.text[:200]}")
            return str(file_id)

    async def _create_task(self, action: str, payload: dict[str, Any]) -> str:
        headers = self._headers()
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(
                f"{self.base}/s2s/v2.0/task/{action}",
                headers=headers,
                json=payload,
            )
            data = _json(r)
            if r.status_code >= 400:
                raise YouCamError(f"{action} create {r.status_code}: {_err_text(data)}")
            task_id = _find_task_id(data)
            if not task_id:
                raise YouCamError(f"{action} create returned no task_id")
            return task_id

    async def _poll(self, action: str, task_id: str, timeout_s: float = 90.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_s
        last: dict[str, Any] | None = None
        async with httpx.AsyncClient(timeout=30.0) as client:
            while time.monotonic() < deadline:
                r = await client.get(
                    f"{self.base}/s2s/v2.0/task/{action}/{task_id}",
                    headers=self._headers(),
                )
                data = _json(r)
                if r.status_code >= 400:
                    last = data
                    await asyncio.sleep(1.5)
                    continue
                last = data
                status = _task_status(data)
                if status in {"success", "done", "completed", "ok", "finished"}:
                    return _unwrap(data)
                if status in {"error", "failed", "fail"}:
                    raise YouCamError(f"YouCam {action} failed: {_err_text(data)}")
                await asyncio.sleep(1.5)
        raise YouCamError(f"YouCam {action} timed out ({task_id}): {_err_text(last or {})}")


def _normalize_base(raw: str) -> str:
    base = (raw or DEFAULT_HOST).rstrip("/")
    if base.endswith("/s2s"):
        base = base[:-4]
    # Official YouCam AI API host (docs.perfectcorp.com).
    if "yce-api-01.perfectcorp.com" in base:
        return DEFAULT_HOST
    return base or DEFAULT_HOST


def _is_face_too_small(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "face_too_small" in msg or "src_face_too_small" in msg or "face_position_too_small" in msg


def _skin_has_scores(data: dict[str, Any]) -> bool:
    results = data.get("results") if isinstance(data.get("results"), dict) else {}
    output = results.get("output")
    if isinstance(output, list) and output:
        return True
    if isinstance(output, dict) and output:
        return True
    if any(isinstance(results.get(k), (int, float, dict)) for k in ("redness", "wrinkle", "pore", "skin_age")):
        return True
    return False


def _jpeg_bytes(path: Path, face_tightness: float | None = None) -> tuple[bytes, str, str]:
    with Image.open(path) as img:
        rgb = img.convert("RGB")
        if face_tightness:
            rgb = _crop_face_focus(rgb, face_tightness)
        w, h = rgb.size
        short = min(w, h)
        if short < 480:
            scale = 480 / short
            rgb = rgb.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=92)
    return buf.getvalue(), "image/jpeg", path.stem + ".jpg"


def _crop_face_focus(img: Image.Image, tightness: float) -> Image.Image:
    """Tighten a portrait so the face fills more of the frame (YouCam wants face width >= 60%)."""
    w, h = img.size
    frac = min(0.95, max(0.28, tightness))
    crop_w = max(1, int(w * frac))
    crop_h = max(1, int(h * frac))
    left = max(0, (w - crop_w) // 2)
    top = max(0, int(h * 0.06))
    if top + crop_h > h:
        top = max(0, h - crop_h)
    return img.crop((left, top, left + crop_w, top + crop_h))


def _json(resp: httpx.Response) -> dict[str, Any]:
    try:
        data = resp.json()
    except Exception:
        return {"error": resp.text[:240], "status": resp.status_code}
    return data if isinstance(data, dict) else {"data": data}


def _err_text(data: dict[str, Any]) -> str:
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    parts = [
        data.get("error"),
        data.get("error_code") or data.get("errorCode"),
        inner.get("error") if isinstance(inner, dict) else None,
        inner.get("error_message") if isinstance(inner, dict) else None,
    ]
    text = " ".join(str(p) for p in parts if p)
    return text or str(data)[:240]


def _read_score_info(blob: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        name = next((n for n in zf.namelist() if n.endswith("score_info.json")), None)
        if not name:
            raise YouCamError("Skin zip missing score_info.json")
        return json.loads(zf.read(name))


def score_info_to_results(info: dict[str, Any]) -> dict[str, Any]:
    output: list[dict[str, Any]] = []
    for key, val in info.items():
        if key in {"all", "skin_age"}:
            continue
        node = val
        if isinstance(val, dict) and "ui_score" not in val and "raw_score" not in val:
            node = val.get("whole") if isinstance(val.get("whole"), dict) else None
        if not isinstance(node, dict):
            continue
        if node.get("ui_score") is None and node.get("raw_score") is None:
            continue
        output.append(
            {
                "type": key,
                "ui_score": node.get("ui_score"),
                "raw_score": node.get("raw_score"),
            }
        )
    return {"output": output, "skin_age": info.get("skin_age")}


def _first_file(data: dict[str, Any]) -> Optional[dict[str, Any]]:
    for root in (data.get("data"), data.get("result"), data):
        if not isinstance(root, dict):
            continue
        files = root.get("files")
        if isinstance(files, list) and files and isinstance(files[0], dict):
            return files[0]
    return None


def _find_task_id(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    for root in (data.get("data"), data.get("result"), data):
        if not isinstance(root, dict):
            continue
        for key in ("task_id", "taskId", "id"):
            val = root.get(key)
            if isinstance(val, (str, int)) and key != "status":
                return str(val)
    return None


def _task_status(data: dict[str, Any]) -> str:
    for root in (data.get("data"), data.get("result"), data):
        if not isinstance(root, dict):
            continue
        raw = root.get("task_status") or root.get("status") or root.get("state")
        if raw and str(raw).lower() not in {"200", "ok"}:
            return str(raw).lower()
    return ""


def _unwrap(data: dict[str, Any]) -> dict[str, Any]:
    inner = data.get("data") or data.get("result")
    if isinstance(inner, dict) and (
        inner.get("results") or inner.get("output") or inner.get("url") or inner.get("task_status")
    ):
        return inner
    return data


def _garment_category(raw: str) -> str:
    key = (raw or "").strip().lower()
    mapping = {
        "clothes": "auto",
        "auto": "auto",
        "upper": "upper_body",
        "upper_body": "upper_body",
        "top": "upper_body",
        "tops": "upper_body",
        "shirt": "upper_body",
        "blouse": "upper_body",
        "lower": "lower_body",
        "lower_body": "lower_body",
        "bottom": "lower_body",
        "bottoms": "lower_body",
        "pants": "lower_body",
        "skirt": "lower_body",
        "dress": "full_body",
        "full": "full_body",
        "full_body": "full_body",
        "outfit": "full_body",
        "outer": "outer",
        "outerwear": "outer",
        "jacket": "outer",
        "coat": "outer",
        "shoes": "shoes",
        "shoe": "shoes",
    }
    return mapping.get(key, "auto")


def _as_dict(node: Any) -> dict[str, Any]:
    return node if isinstance(node, dict) else {}


def _undertone_from_hex(hx: str) -> str:
    raw = hx.lstrip("#")
    if len(raw) != 6:
        return "neutral"
    r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    if r - b > 28 and g >= b:
        return "warm"
    if b >= r - 4:
        return "cool"
    return "neutral"


def normalize_profile_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    """Convert live YouCam payloads into internal profile fields."""
    skin = _unwrap(_as_dict(bundle.get("skin")))
    color = _unwrap(_as_dict(bundle.get("color")))
    fitz = _unwrap(_as_dict(bundle.get("fitzpatrick")))
    skin_out = _as_dict(skin.get("output")) or _as_dict(_as_dict(skin.get("results")).get("output")) or skin
    color_results = _as_dict(color.get("results")) or color
    color_out = _as_dict(color_results.get("color")) or _as_dict(color.get("output")) or color_results
    fitz_results = _as_dict(fitz.get("results")) or fitz
    fitz_out = _as_dict(fitz.get("output")) or fitz_results

    concerns: list[ConcernScore] = []
    concerns_raw = (
        skin_out.get("concerns")
        or skin.get("concerns")
        or skin_out.get("scores")
        or []
    )
    if isinstance(skin_out, dict) and isinstance(skin.get("results"), dict):
        output_list = skin["results"].get("output")
        if isinstance(output_list, list):
            concerns_raw = output_list
    if isinstance(concerns_raw, dict):
        concerns_raw = [{"name": k, "score": v} for k, v in concerns_raw.items()]
    if not concerns_raw:
        for key in CONCERN_KEYS:
            if key in skin_out and isinstance(skin_out[key], (int, float)):
                concerns_raw.append({"name": key, "score": skin_out[key]})
    for c in concerns_raw:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or c.get("type") or c.get("key") or "unknown")
        name = CONCERN_ALIASES.get(name, name)
        if name in {"skin_type", "hd_skin_type"}:
            continue
        score = c.get("score")
        if score is None:
            score = c.get("ui_score")
        if score is None:
            score = c.get("value") or 0
        score = float(score)
        raw_type = str(c.get("type") or "")
        is_live = c.get("ui_score") is not None or bool(raw_type)
        if is_live and (name in INVERT_CONCERNS or raw_type in INVERT_CONCERNS):
            score = 100.0 - score
        score = max(0.0, min(100.0, score))
        severity = "high" if score >= 70 else "medium" if score >= 45 else "low"
        concerns.append(ConcernScore(name=name, score=score, severity=severity))

    undertone = (
        color_out.get("undertone")
        or color_out.get("undertone_hint")
        or color.get("undertone")
        or ""
    )
    undertone = str(undertone).lower()
    if undertone not in {"cool", "warm", "neutral"}:
        skin_hex = color_out.get("skin_color") or ""
        if isinstance(color_out.get("skin"), dict):
            skin_hex = color_out["skin"].get("hex") or skin_hex
        undertone = _undertone_from_hex(str(skin_hex)) if skin_hex else "neutral"

    palette: list[ColorSwatch] = []
    hex_map = {
        "skin": color_out.get("skin_color"),
        "hair": color_out.get("hair_color"),
        "eye": color_out.get("eye_color"),
        "lip": color_out.get("lip_color"),
        "brow": color_out.get("eyebrow_color"),
    }
    for role in ("skin", "hair", "eye", "lip", "brow"):
        hex_v = hex_map.get("brow" if role == "eyebrow" else role)
        node = color_out.get(role) or color.get(role) or {}
        if isinstance(node, dict):
            hex_v = hex_v or node.get("hex") or node.get("color")
        elif isinstance(node, str) and node.startswith("#"):
            hex_v = hex_v or node
        if hex_v:
            palette.append(ColorSwatch(role="brow" if role == "eyebrow" else role, hex=str(hex_v)))

    fitz_type = (
        fitz_out.get("fitzpatrick_scale")
        or fitz_results.get("fitzpatrick_scale")
        or fitz_out.get("type")
        or fitz_out.get("fitzpatrick")
        or fitz_out.get("skin_type")
        or fitz.get("type")
        or fitz.get("fitzpatrick")
    )
    depth = "medium"
    if fitz_type in ("I", "II", 1, 2, "1", "2"):
        depth = "light"
    elif fitz_type in ("V", "VI", 5, 6, "5", "6"):
        depth = "deep"

    contrast = "medium"
    try:
        skin_hex = next(p.hex for p in palette if p.role == "skin")
        hair_hex = next(p.hex for p in palette if p.role == "hair")

        def lum(hx: str) -> float:
            hx = hx.lstrip("#")
            r, g, b = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
            return 0.2126 * r + 0.7152 * g + 0.0722 * b

        delta = abs(lum(skin_hex) - lum(hair_hex))
        contrast = "high" if delta > 90 else "low" if delta < 40 else "medium"
    except Exception:
        pass

    skin_age = (
        skin_out.get("skin_age")
        or skin.get("skin_age")
        or _as_dict(skin.get("results")).get("skin_age")
    )
    if skin_age is None:
        for item in concerns_raw if isinstance(concerns_raw, list) else []:
            if isinstance(item, dict) and item.get("type") == "skin_age":
                skin_age = item.get("ui_score") or item.get("score")

    return {
        "undertone": undertone,
        "depth": depth,
        "contrast": contrast,
        "fitzpatrick": str(fitz_type) if fitz_type else None,
        "skin_age": float(skin_age) if skin_age is not None else None,
        "concerns": concerns,
        "palette": palette,
        "raw": bundle,
    }


_client: Optional[YouCamClient] = None


def get_youcam_client() -> YouCamClient:
    global _client
    if _client is None:
        _client = YouCamClient()
    return _client
