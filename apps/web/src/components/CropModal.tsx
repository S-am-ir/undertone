"use client";

import { useCallback, useRef, useState } from "react";

type Box = { x: number; y: number; width: number; height: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (file: File, box: Box) => Promise<void>;
};

export function CropModal({ open, onClose, onConfirm }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [box, setBox] = useState<Box>({ x: 0.15, y: 0.15, width: 0.7, height: 0.7 });
  const [dragging, setDragging] = useState<"move" | "br" | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{ px: number; py: number; box: Box } | null>(null);

  const onFile = (f: File) => {
    if (src) URL.revokeObjectURL(src);
    setFile(f);
    setSrc(URL.createObjectURL(f));
  };

  const closeModal = () => {
    if (src) URL.revokeObjectURL(src);
    setFile(null);
    setSrc(null);
    setBox({ x: 0.15, y: 0.15, width: 0.7, height: 0.7 });
    onClose();
  };

  const onPointer = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      if (!startRef.current) return;
      const { px, py, box: sb } = startRef.current;
      const dx = nx - px;
      const dy = ny - py;
      if (dragging === "move") {
        setBox({
          ...sb,
          x: Math.max(0, Math.min(1 - sb.width, sb.x + dx)),
          y: Math.max(0, Math.min(1 - sb.height, sb.y + dy)),
        });
      } else {
        setBox({
          ...sb,
          width: Math.max(0.08, Math.min(1 - sb.x, sb.width + dx)),
          height: Math.max(0.08, Math.min(1 - sb.y, sb.height + dy)),
        });
      }
    },
    [dragging]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-2xl p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl">Capture garment</h2>
          <button type="button" className="btn-ghost text-sm" onClick={closeModal}>
            Close
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          Drop a product page screenshot or garment photo, then drag the frame to isolate the piece.
        </p>

        {!src ? (
          <label className="flex h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-card-border bg-background/60 text-sm text-muted hover:bg-accent-soft/40">
            <span>Click to upload screenshot / product image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div
            className="relative overflow-hidden rounded-2xl bg-black/5 select-none"
            onPointerMove={onPointer}
            onPointerUp={() => {
              setDragging(null);
              startRef.current = null;
            }}
            onPointerLeave={() => {
              setDragging(null);
              startRef.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={src} alt="Crop source" className="max-h-[420px] w-full object-contain" />
            <div
              className="absolute border-2 border-accent bg-accent/10"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                if (!imgRef.current) return;
                const rect = imgRef.current.getBoundingClientRect();
                startRef.current = {
                  px: (e.clientX - rect.left) / rect.width,
                  py: (e.clientY - rect.top) / rect.height,
                  box,
                };
                setDragging("move");
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
            >
              <div
                className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 rounded-sm bg-accent"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!imgRef.current) return;
                  const rect = imgRef.current.getBoundingClientRect();
                  startRef.current = {
                    px: (e.clientX - rect.left) / rect.width,
                    py: (e.clientY - rect.top) / rect.height,
                    box,
                  };
                  setDragging("br");
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!file || busy}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              try {
                await onConfirm(file, box);
                closeModal();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Adding…" : "Use crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
