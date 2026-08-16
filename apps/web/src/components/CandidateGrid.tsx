"use client";

import { mediaUrl, type Candidate } from "@/lib/api";
import { cn } from "@/lib/cn";

function tierColor(tier: string) {
  if (tier === "strong") return "text-[var(--success)]";
  if (tier === "caution") return "text-[var(--danger)]";
  return "text-[var(--caution)]";
}

function tierLabel(tier: string) {
  if (tier === "strong") return "Strong fit";
  if (tier === "caution") return "Style with intention";
  return "Worth a closer look";
}

function displayName(candidate: Candidate) {
  const family = candidate.color_features?.primary_family;
  if (typeof family === "string" && family) return `${family[0].toUpperCase()}${family.slice(1)} look`;
  return candidate.label && !/\.(jpe?g|png|webp)$/i.test(candidate.label) ? candidate.label : "Your garment";
}

export function CandidateGrid({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ranked = [...candidates].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const heroes = ranked.filter((c) => c.is_topk);
  const rest = ranked.filter((c) => !c.is_topk);
  const unscored = candidates.every((c) => !c.rank && c.final_score === 0);

  if (!candidates.length) {
    return (
      <div className="card flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
        <p className="font-display text-xl text-ink">No garments yet</p>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Upload pieces you&apos;re considering, or capture a crop from a product screenshot.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      {heroes.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">Top picks</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {heroes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "card overflow-hidden text-left transition ring-offset-2",
                  selectedId === c.id ? "ring-2 ring-accent" : "hover:border-accent/40"
                )}
              >
                <div className="relative aspect-[3/4] bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(c.vto_url || c.image_url)}
                    alt={c.label || "Garment"}
                    className="h-full w-full object-cover"
                  />
                  {c.rank && (
                    <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-xs text-white">
                      #{c.rank}
                    </span>
                  )}
                  {c.vto_status === "running" && (
                    <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-xs text-white">
                      Rendering try-on…
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-medium capitalize", tierColor(c.tier))}>
                      {tierLabel(c.tier)}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-muted">Personal read</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                     {c.short_verdict || c.verdict_title || displayName(c)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(heroes.length === 0 || unscored) && (
        <div>
          {unscored && (
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
              Ready to analyze · {candidates.length} piece{candidates.length === 1 ? "" : "s"}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "card overflow-hidden text-left transition",
                  selectedId === c.id && "ring-2 ring-accent"
                )}
              >
                <div className="aspect-square bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(c.image_url)} alt="" className="h-full w-full object-cover" />
                </div>
                <p className="truncate p-2 text-xs text-muted">{c.label || "Garment"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && heroes.length > 0 && !unscored && (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
            Other scored ({rest.length})
          </p>
          <div className="flex flex-col gap-2">
            {rest.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-card-border bg-card p-2 text-left hover:bg-accent-soft/30",
                  selectedId === c.id && "ring-2 ring-accent"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(c.image_url)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                     {displayName(c)}
                  </p>
                  <p className="text-xs text-muted">{c.short_verdict || "Scored · no try-on yet"}</p>
                </div>
                <span className="text-xs text-muted">{tierLabel(c.tier)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
