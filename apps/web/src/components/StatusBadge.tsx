"use client";

import { useEffect, useState } from "react";
import { health } from "@/lib/api";

export function StatusBadge() {
  const [label, setLabel] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await health();
        if (cancelled) return;
        const missing = h.youcam === "missing-key" || h.llm === "missing-key";
        setOk(h.status === "ok" && !missing);
        const bits = [
          h.youcam === "live" ? "YouCam" : "YouCam key missing",
          h.llm === "missing-key" ? "LLM key missing" : h.llm.toUpperCase(),
          h.supabase === "on" ? "Supabase" : "local store",
        ];
        setLabel(bits.join(" · "));
      } catch {
        if (!cancelled) {
          setOk(false);
          setLabel("API offline");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!label) return null;

  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex ${
        ok
          ? "border-card-border bg-card text-muted"
          : "border-[var(--danger)]/30 bg-white text-[var(--danger)]"
      }`}
      title={label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
      {label}
    </span>
  );
}
