"use client";

import { mediaUrl, type SkinProfile } from "@/lib/api";

export function ProfileDrawer({
  profile,
  open,
  onClose,
}: {
  profile: SkinProfile;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const concerns = [...profile.concerns].sort((a, b) => b.score - a.score).slice(0, 6);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your profile">
      <button type="button" aria-label="Close profile" className="absolute inset-0 bg-ink/35 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-card-border bg-card p-6 shadow-2xl animate-in sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Your profile</p>
            <h2 className="font-display mt-2 text-3xl text-ink">Your color signature</h2>
          </div>
          <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={onClose}>Close</button>
        </div>

        <div className="mt-7 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(profile.selfie_url)} alt="Your selfie" className="h-20 w-20 rounded-2xl object-cover" />
          <div>
            <p className="font-display text-2xl capitalize text-ink">{profile.undertone} undertone</p>
            <p className="mt-1 text-sm capitalize text-muted">{profile.depth} depth · {profile.contrast} contrast</p>
            {profile.fitzpatrick && <p className="mt-1 text-xs text-muted">Fitzpatrick {profile.fitzpatrick}</p>}
          </div>
        </div>

        {profile.summary && <p className="mt-6 text-[15px] leading-relaxed text-ink/80">{profile.summary}</p>}

        <section className="mt-8">
          <p className="eyebrow">Facial palette</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {profile.palette.map((swatch) => (
              <div key={swatch.role} className="flex items-center gap-2 rounded-2xl border border-card-border bg-background p-2">
                <span className="h-8 w-8 rounded-xl border border-black/5" style={{ background: swatch.hex }} />
                <span className="text-xs capitalize text-muted">{swatch.role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Today&apos;s signals</p>
              <p className="mt-1 text-xs text-muted">Cosmetic analysis signals, not a medical diagnosis.</p>
            </div>
            {profile.skin_age != null && <span className="text-xs text-muted">AI skin age {Math.round(profile.skin_age)}</span>}
          </div>
          <div className="mt-4 space-y-4">
            {concerns.map((concern) => (
              <div key={concern.name}>
                <div className="flex justify-between text-xs">
                  <span className="capitalize text-ink">{concern.name.replace(/_/g, " ")}</span>
                  <span className="text-muted">{Math.round(concern.score)}</span>
                </div>
                <div className="meter-track mt-2"><span style={{ width: `${concern.score}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
