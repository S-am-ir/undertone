"use client";

import { mediaUrl, type SkinProfile } from "@/lib/api";

export function ProfileCard({ profile, compact = false }: { profile: SkinProfile; compact?: boolean }) {
  const topConcerns = [...profile.concerns].sort((a, b) => b.score - a.score).slice(0, 5);

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-card-border bg-card py-1.5 pl-1.5 pr-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(profile.selfie_url)}
          alt="You"
          className="h-9 w-9 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium capitalize text-ink">
            {profile.undertone} · {profile.depth}
          </p>
          <p className="truncate text-xs text-muted">View your color signature</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-[280px] bg-accent-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(profile.selfie_url)}
            alt="Your selfie"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-center p-6 md:p-8">
          <p className="eyebrow">Your profile</p>
          <h2 className="font-display mt-2 text-3xl text-ink">
            {profile.undertone} undertone
          </h2>
          <p className="mt-2 text-sm capitalize text-muted">
            {profile.depth} depth · {profile.contrast} contrast
            {profile.fitzpatrick ? ` · Fitzpatrick ${profile.fitzpatrick}` : ""}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink/80">{profile.summary}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {profile.palette.map((p) => (
              <div key={p.role} className="flex items-center gap-2 rounded-full border border-card-border bg-white px-2 py-1">
                <span className="h-5 w-5 rounded-full border border-black/5" style={{ background: p.hex }} />
                <span className="text-xs capitalize text-muted">{p.role}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-card-border pt-5">
            <div className="flex items-end justify-between gap-3">
              <p className="eyebrow">Today&apos;s signals</p>
              {profile.skin_age != null && <span className="text-xs text-muted">AI skin age {Math.round(profile.skin_age)}</span>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {topConcerns.slice(0, 4).map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs">
                    <span className="capitalize text-ink">{c.name.replace(/_/g, " ")}</span>
                    <span className="text-muted">{Math.round(c.score)}</span>
                  </div>
                  <div className="meter-track mt-2"><span style={{ width: `${c.score}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
