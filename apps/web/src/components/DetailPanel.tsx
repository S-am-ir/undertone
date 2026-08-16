"use client";

import { deleteCandidate, forceVto, mediaUrl, type Candidate, type Session } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useState } from "react";

function readableSignal(signal: string) {
  const labels: Record<string, string> = {
    undertone: "Undertone relationship",
    redness: "Complexion balance",
    depth: "Depth and contrast",
    harmony: "Color relationship",
    preference: "Your stated moment",
    fit: "Overall fit",
  };
  return labels[signal] || signal.replace(/[_-]+/g, " ");
}

function tierLabel(tier: string) {
  if (tier === "strong") return "Strong fit";
  if (tier === "caution") return "Style with intention";
  return "Worth a closer look";
}

export function DetailPanel({
  session,
  candidate,
  onUpdated,
}: {
  session: Session;
  candidate: Candidate | null;
  onUpdated: (s: Session) => void;
}) {
  const showFull = useAppStore((s) => s.showFullAnalysis);
  const setShowFull = useAppStore((s) => s.setShowFullAnalysis);
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const [busy, setBusy] = useState(false);

  if (!candidate) {
    return (
      <div className="card flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-muted">
        Select a garment to see try-on and reasons.
      </div>
    );
  }

  const reasons = showFull ? candidate.reasons : candidate.reasons.slice(0, 2);
  const family =
    typeof candidate.color_features?.primary_family === "string"
      ? candidate.color_features.primary_family
      : null;
  const hex =
    typeof candidate.color_features?.primary_hex === "string"
      ? candidate.color_features.primary_hex
      : null;
  const garmentName = family
    ? `${family[0].toUpperCase()}${family.slice(1)} look`
    : candidate.label && !/\.(jpe?g|png|webp)$/i.test(candidate.label)
      ? candidate.label
      : "Your garment";

  return (
    <div className="card overflow-hidden animate-in">
      <div className="relative aspect-[4/5] bg-background md:aspect-[3/4]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(candidate.vto_url || candidate.image_url)}
          alt="Detail"
          className="h-full w-full object-cover"
        />
        {candidate.vto_url && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs text-ink">
            Try-on
          </span>
        )}
        {candidate.vto_status === "error" && (
          <span className="absolute inset-x-0 bottom-0 bg-[var(--danger)]/90 px-3 py-2 text-center text-xs text-white">
            Try-on failed{candidate.vto_error ? `: ${candidate.vto_error}` : ""}
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">
              {candidate.rank ? `Option #${candidate.rank}` : "Candidate"} · {tierLabel(candidate.tier)}
            </p>
            <h3 className="font-display mt-1 text-2xl text-ink">{candidate.verdict_title || `${candidate.tier} direction`}</h3>
            {(candidate.label || family) && (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                {hex && (
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-card-border"
                    style={{ background: hex }}
                  />
                )}
                {garmentName}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {!candidate.vto_url && (
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const s = await forceVto(session.id, candidate.id);
                    onUpdated(s);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "…" : "Try on"}
              </button>
            )}
            <button
              type="button"
              className="btn-ghost text-xs text-muted"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const s = await deleteCandidate(session.id, candidate.id);
                  onUpdated(s);
                  setSelectedId(s.candidates[0]?.id ?? null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove
            </button>
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-ink/85">
          {candidate.short_verdict || "Run analyze for a verdict."}
        </p>

        {candidate.comparison_note && (
          <div className="mt-4 rounded-2xl bg-accent-soft/55 p-4 text-sm leading-relaxed text-ink">
            <span className="font-medium">Why this place in the ranking: </span>{candidate.comparison_note}
          </div>
        )}

        {reasons.length > 0 && (
          <ul className="mt-4 space-y-2">
            {reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span
                  className={
                    r.direction === "support"
                      ? "text-[var(--success)]"
                      : r.direction === "conflict"
                        ? "text-[var(--danger)]"
                        : "text-muted"
                  }
                >
                  ●
                </span>
                  <span className="text-ink/80">
                  <span className="font-medium">{readableSignal(r.signal)}</span> — {r.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {candidate.reasons.length > 2 && (
          <button
            type="button"
            className="mt-4 text-sm text-accent underline-offset-2 hover:underline"
            onClick={() => setShowFull(!showFull)}
          >
            {showFull ? "Show less" : "Full analysis"}
          </button>
        )}

        {candidate.evidence && candidate.evidence.length > 0 && (
          <div className="mt-6 space-y-4 border-t border-card-border pt-5">
            <div>
              <p className="eyebrow">What shaped this read</p>
              <p className="mt-1 text-xs text-muted">Your profile, the garment color, and your stated moment.</p>
            </div>
            {candidate.evidence.map((meter) => (
              <div key={meter.key}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-ink">{meter.label}</span>
                  <span className="text-muted">{Math.round(meter.score)}</span>
                </div>
                <div className={`meter-track ${meter.tone === "caution" ? "caution" : meter.tone === "positive" ? "positive" : ""} mt-2`}><span style={{ width: `${meter.score}%` }} /></div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{meter.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
