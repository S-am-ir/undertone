"use client";

import { mediaUrl, type Candidate } from "@/lib/api";

export function CompareView({ candidates, summary }: { candidates: Candidate[]; summary?: string }) {
  const top = [...candidates]
    .filter((c) => c.is_topk)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 3);

  if (top.length < 2) {
    return (
      <div className="card p-6 text-sm text-muted">
        Add and analyze at least two garments to compare side by side.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Your decision</p>
        <h3 className="font-display mt-1 text-2xl text-ink">The strongest read for you</h3>
        {summary && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{summary}</p>}
      </div>
      <div className={`grid gap-4 ${top.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {top.map((c) => (
          <div key={c.id} className="card overflow-hidden">
            <div className="relative aspect-[3/4] bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(c.vto_url || c.image_url)}
                alt=""
                className="h-full w-full object-cover"
              />
              <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-xs text-white">
                {c.rank === 1 ? "Strongest match" : `Next best · #${c.rank}`}
              </span>
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-ink">{c.verdict_title || `${c.tier} direction`}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.short_verdict}</p>
              {c.reasons[0] && (
                <p className="mt-3 border-t border-card-border pt-3 text-xs text-ink/70">
                  {c.reasons[0].text}
                </p>
              )}
              {c.evidence?.slice(0, 2).map((meter) => (
                <div key={meter.key} className="mt-3">
                  <div className="flex justify-between text-[11px] text-muted"><span>{meter.label}</span><span>{Math.round(meter.score)}</span></div>
                  <div className={`meter-track ${meter.tone === "caution" ? "caution" : meter.tone === "positive" ? "positive" : ""} mt-1`}><span style={{ width: `${meter.score}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
