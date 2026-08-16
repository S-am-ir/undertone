"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
/* eslint-disable @next/next/no-img-element */
import { createSession, getSession, mediaUrl } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { BusyOverlay } from "@/components/BusyOverlay";
import { useAppStore } from "@/lib/store";
import { cleanDisplayText, profileGuidance } from "@/lib/styling";

export default function ProfilePage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#f6f4ef] text-sm text-[#777b88]">Opening your profile…</main>}><ProfilePageInner /></Suspense>;
}

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { sessionId, session, setSession, setSessionId, reset } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = searchParams.get("session") || sessionId;
        if (!active) {
          const created = await createSession();
          if (cancelled) return;
          setSessionId(created.id);
          setSession(await getSession(created.id));
        } else {
          const loaded = await getSession(active);
          if (cancelled) return;
          setSessionId(active);
          setSession(loaded);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Your profile could not be opened.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newSession() {
    reset();
    setBusy("Opening a fresh styling session…");
    try {
      const created = await createSession();
      const fresh = await getSession(created.id);
      setSessionId(created.id);
      setSession(fresh);
      router.push(`/app?session=${encodeURIComponent(created.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A fresh session could not be opened.");
    } finally { setBusy(null); }
  }

  async function switchSession(id: string) {
    setBusy("Opening that styling session…");
    try {
      const loaded = await getSession(id);
      setSessionId(id);
      setSession(loaded);
      router.push(`/app/profile?session=${encodeURIComponent(id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That session could not be opened.");
    } finally { setBusy(null); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f6f4ef] text-sm text-[#777b88]">Reading your color signature…</main>;
  if (!session?.profile) return <main className="grid min-h-screen place-items-center bg-[#f6f4ef] px-5 text-center"><div><p className="eyebrow text-[#6a5ed6]">Profile not started</p><h1 className="mt-4 font-display text-5xl">Start with a clear selfie.</h1><Link href={`/app?session=${encodeURIComponent(sessionId || "")}`} className="mt-7 inline-flex rounded-full bg-[#ff6d7d] px-5 py-3 font-semibold text-[#2a141b]">Go to the studio</Link></div></main>;

  const profile = session.profile;
  const guidance = profileGuidance(profile);
  const concerns = [...profile.concerns].sort((a, b) => b.score - a.score).slice(0, 5);

  return <AppShell active="profile" session={session} sessionId={sessionId} onNewSession={() => void newSession()} onSelectSession={(id) => void switchSession(id)} onDeleted={() => void newSession()}>
    <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-[#6a5ed6]">Your personal color signature</p><h1 className="mt-3 max-w-3xl font-display text-6xl leading-[.87] tracking-[-.07em] sm:text-8xl">A palette that stays with you.</h1><p className="mt-6 max-w-2xl text-[15px] leading-7 text-[#686b78]">This is the lens Undertone carries into every garment decision. It is about how color frames you—not a rulebook for what you are allowed to wear.</p></div><Link href={`/app?session=${encodeURIComponent(sessionId || "")}`} className="rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5">Back to studio ↗</Link></div>

      {error && <div className="mt-6 rounded-2xl border border-[#ffb9c1] bg-[#fff2f3] px-5 py-4 text-sm text-[#9b3041]">{error}</div>}

      <section className="mt-10 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="relative min-h-[520px] overflow-hidden rounded-[2.2rem] bg-[#dfe8e3] shadow-[0_24px_70px_rgba(37,52,55,.12)]"><img src={mediaUrl(profile.selfie_url)} alt="Your profile portrait" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#101525]/90 via-[#101525]/20 to-transparent p-7 text-white md:p-9"><p className="eyebrow text-[#caf3a6]">The person behind the board</p><p className="mt-3 max-w-sm font-display text-4xl leading-[.92]">Your clothes get judged in context. So does your color.</p></div><span className="absolute right-5 top-5 rounded-full bg-white/85 px-3 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#5d50cf]">Live profile</span></div>
        <div className="grid gap-5">
          <div className="rounded-[2.2rem] bg-[#111827] p-7 text-white md:p-9"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow text-[#cabdff]">You read as</p><h2 className="mt-4 font-display text-6xl capitalize leading-[.85] tracking-[-.065em]">{profile.undertone}<br /><span className="text-[#caf3a6]">{profile.depth} depth</span></h2></div><div className="rounded-2xl border border-white/10 px-4 py-3 text-right"><p className="text-[10px] uppercase tracking-[.15em] text-white/45">Contrast</p><p className="mt-1 text-lg font-semibold capitalize">{profile.contrast}</p></div></div><p className="mt-7 max-w-xl text-[15px] leading-7 text-white/70">{cleanDisplayText(profile.summary)}</p><div className="mt-7 flex flex-wrap gap-2">{profile.palette.map((swatch) => <div key={swatch.role} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2"><span className="h-5 w-5 rounded-full border border-white/10" style={{ background: swatch.hex }} /><span className="text-xs capitalize text-white/70">{swatch.label || swatch.role}</span></div>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[1.6rem] border border-[#ded9d2] bg-[#fffdfa] p-5"><p className="eyebrow text-[#6a5ed6]">Undertone</p><p className="mt-4 font-display text-3xl capitalize">{profile.undertone}</p><p className="mt-2 text-xs leading-5 text-[#777b88]">The temperature your best colors tend to echo.</p></div><div className="rounded-[1.6rem] border border-[#ded9d2] bg-[#fffdfa] p-5"><p className="eyebrow text-[#6a5ed6]">Depth</p><p className="mt-4 font-display text-3xl capitalize">{profile.depth}</p><p className="mt-2 text-xs leading-5 text-[#777b88]">How much visual weight a color can carry.</p></div><div className="rounded-[1.6rem] border border-[#ded9d2] bg-[#fffdfa] p-5"><p className="eyebrow text-[#6a5ed6]">Contrast</p><p className="mt-4 font-display text-3xl capitalize">{profile.contrast}</p><p className="mt-2 text-xs leading-5 text-[#777b88]">The distance between your natural features.</p></div></div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[2rem] border border-[#ded9d2] bg-[#fffdfa] p-7 md:p-9"><div><p className="eyebrow text-[#6a5ed6]">Your starting lane</p><h2 className="mt-3 font-display text-5xl leading-[.9]">What tends to work beautifully.</h2></div><div className="mt-7 rounded-[1.5rem] bg-[#e7f5df] p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#52664c]">Begin with</p><p className="mt-3 font-display text-3xl leading-tight text-[#23301f]">{guidance.colorLane}</p><p className="mt-4 text-sm leading-6 text-[#5c6d56]">{guidance.contrastLane}</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="rounded-[1.5rem] border border-[#e6e0d8] bg-[#f9f6f1] p-5"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#6a5ed6]">Frame the face</p><p className="mt-3 text-sm leading-6 text-[#676b78]">{guidance.framing}</p></div><div className="rounded-[1.5rem] border border-[#e6e0d8] bg-[#f9f6f1] p-5"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#6a5ed6]">Use your depth</p><p className="mt-3 text-sm leading-6 text-[#676b78]">{guidance.depthNote}</p></div></div></div>
        <div className="rounded-[2rem] bg-[#efeaff] p-7 md:p-9"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-[#6a5ed6]">Today&apos;s visual signals</p><h2 className="mt-3 font-display text-4xl leading-none">A quiet read, not a diagnosis.</h2></div>{profile.skin_age != null && <span className="rounded-full bg-white/70 px-3 py-2 text-[10px] font-semibold text-[#6a5ed6]">Skin signal · {Math.round(profile.skin_age)}</span>}</div><p className="mt-4 text-sm leading-6 text-[#6f6a80]">These signals help the styling read respond to the image you gave us today. They do not define your skin or make a medical claim.</p><div className="mt-7 space-y-5">{concerns.map((concern) => <div key={concern.name}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold capitalize text-[#333046]">{concern.name.replace(/_/g, " ")}</span><span className="text-[#77718b]">{Math.round(concern.score)} / 100</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70"><span className="block h-full rounded-full bg-gradient-to-r from-[#9f91ef] to-[#6a5ed6]" style={{ width: `${concern.score}%` }} /></div></div>)}</div></div>
      </section>

      <section className="mt-5 rounded-[2rem] border border-[#ded9d2] bg-[#111827] p-7 text-white md:p-9"><div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="eyebrow text-[#cabdff]">How the profile travels</p><h2 className="mt-3 font-display text-5xl leading-[.9]">This is not a report you leave behind.</h2></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-bold text-[#caf3a6]">01</p><p className="mt-3 text-sm font-semibold">You add a piece</p><p className="mt-2 text-xs leading-5 text-white/50">Upload it or capture it from a store.</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-bold text-[#caf3a6]">02</p><p className="mt-3 text-sm font-semibold">We read the relationship</p><p className="mt-2 text-xs leading-5 text-white/50">Color, contrast, skin signals, and your moment.</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-bold text-[#caf3a6]">03</p><p className="mt-3 text-sm font-semibold">You see the choice</p><p className="mt-2 text-xs leading-5 text-white/50">Only the strongest directions get the full try-on.</p></div></div></div><Link href={`/app?session=${encodeURIComponent(sessionId || "")}`} className="mt-8 inline-flex rounded-full bg-[#ff6d7d] px-5 py-3.5 text-sm font-semibold text-[#2a141b] transition hover:-translate-y-0.5">Dress for a moment ↗</Link></section>
    </main>
    <BusyOverlay message={busy} />
  </AppShell>;
}
