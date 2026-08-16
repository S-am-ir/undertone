"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
/* eslint-disable @next/next/no-img-element */
import { analyze, createSession, getSession, type Candidate, type Session } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { BusyOverlay } from "@/components/BusyOverlay";
import { LookAnalysisModal } from "@/components/LookAnalysisModal";
import { useAppStore } from "@/lib/store";
import { cleanDisplayText, titleCase } from "@/lib/styling";

function labelFor(candidate: Candidate) {
  const family = candidate.color_features?.primary_family;
  const vision = candidate.color_features?.vision;
  const garmentType = vision && typeof vision === "object" && "garment_type" in vision ? String(vision.garment_type || "").trim() : "";
  if (typeof family === "string" && family) return `${titleCase(family)}${garmentType && garmentType !== "garment" ? ` ${garmentType}` : " look"}`;
  return candidate.label || "Your look";
}

export default function DecisionPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#f6f4ef] text-sm text-[#777b88]">Opening your decision…</main>}><DecisionPageInner /></Suspense>;
}

function DecisionPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { sessionId: storedId, session: storedSession, setSession, setSessionId, reset } = useAppStore();
  const sessionId = searchParams.get("session") || storedId;
  const [session, setLocalSession] = useState<Session | null>(storedSession);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeLook, setActiveLook] = useState<Candidate | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = sessionId;
        if (!id) throw new Error("Open a styling session first.");
        const loaded = await getSession(id);
        if (cancelled) return;
        setSessionId(id);
        setSession(loaded);
        setLocalSession(loaded);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The decision could not be opened.");
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
      router.push(`/app?session=${encodeURIComponent(created.id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A fresh session could not be opened."); }
    finally { setBusy(null); }
  }

  async function switchSession(id: string) {
    setBusy("Opening that styling session…");
    try {
      const loaded = await getSession(id);
      setSessionId(id);
      setSession(loaded);
      setLocalSession(loaded);
      router.push(`/app/decision?session=${encodeURIComponent(id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That session could not be opened."); }
    finally { setBusy(null); }
  }

  async function refreshDecision() {
    if (!session?.id) return;
    setBusy("Refreshing the read…");
    try {
      const next = await analyze(session.id);
      setSession(next);
      setLocalSession(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The decision could not be refreshed."); }
    finally { setBusy(null); }
  }

  const ranked = useMemo(() => [...(session?.candidates || [])].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)), [session]);
  const top = ranked.filter((candidate) => candidate.rank && candidate.rank <= 3);
  const winner = top[0] || null;
  const runner = top[1] || null;

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f6f4ef] text-sm text-[#777b88]">Reading the decision…</main>;
  if (!session?.profile || !winner) return <main className="grid min-h-screen place-items-center bg-[#f6f4ef] px-5 text-center"><div><p className="eyebrow text-[#6a5ed6]">No decision yet</p><h1 className="mt-4 font-display text-6xl leading-[.9]">Your board is waiting for a read.</h1><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-[#777b88]">Add a few real pieces in the styling studio, then let Undertone compare them on you.</p><Link href={`/app?session=${encodeURIComponent(sessionId || "")}`} className="mt-7 inline-flex rounded-full bg-[#ff6d7d] px-5 py-3 font-semibold text-[#2a141b]">Return to studio</Link></div></main>;

  return <AppShell active="decision" session={session} sessionId={sessionId} onNewSession={() => void newSession()} onSelectSession={(id) => void switchSession(id)} onDeleted={() => void newSession()}>
    <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-[#6a5ed6]">Your personal decision</p><h1 className="mt-3 font-display text-7xl leading-[.83] tracking-[-.075em] sm:text-8xl">The call is in.</h1><p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#686b78]">{session.intent_text ? `For “${cleanDisplayText(session.intent_text)}”, this is the strongest direction from the pieces you gave us.` : "This is the strongest direction from the pieces you gave us."}</p></div><div className="flex gap-2"><button type="button" onClick={() => void refreshDecision()} className="rounded-full border border-[#dcd6ce] bg-white/70 px-4 py-3 text-xs font-semibold text-[#5d50cf] transition hover:bg-white">Refresh the read</button><Link href={`/app?session=${encodeURIComponent(sessionId || "")}`} className="rounded-full bg-[#111827] px-4 py-3 text-xs font-semibold text-white">Back to studio</Link></div></div>
      {error && <div className="mt-6 rounded-2xl border border-[#ffb9c1] bg-[#fff2f3] px-5 py-4 text-sm text-[#9b3041]">{error}</div>}

      <section className="mt-10 grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
        <button type="button" onClick={() => setActiveLook(winner)} className="group relative min-h-[650px] overflow-hidden rounded-[2.2rem] bg-[#1e264b] text-left shadow-[0_30px_80px_rgba(25,25,62,.18)]"><img src={winner.vto_url || winner.image_url} alt={labelFor(winner)} className="absolute inset-0 h-full w-full object-cover object-[50%_62%] transition duration-700 group-hover:scale-[1.025]" /><div className="absolute inset-0 bg-gradient-to-t from-[#0d1120]/95 via-[#0d1120]/15 to-transparent" /><div className="absolute bottom-0 left-0 right-0 p-7 text-white md:p-10"><div className="flex items-center gap-2"><span className="rounded-full bg-[#caf3a6] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#1d2913]">Strongest direction</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/70">Option 01</span></div><h2 className="mt-4 font-display text-6xl leading-[.82] tracking-[-.06em]">{labelFor(winner)}</h2><p className="mt-5 max-w-xl text-[15px] leading-7 text-white/75">{cleanDisplayText(winner.short_verdict || "The clearest overall read for your profile and moment.")}</p><span className="mt-7 inline-flex rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#171b2b]">Open the full read ↗</span></div></button>
        <div className="space-y-5"><section className="rounded-[2rem] border border-[#ded9d2] bg-[#fffdfa] p-7 md:p-8"><p className="eyebrow text-[#6a5ed6]">Why this wins</p><h2 className="mt-4 font-display text-4xl leading-[.92]">The answer is more than a color.</h2><p className="mt-5 text-[15px] leading-7 text-[#5e6370]">{cleanDisplayText(session.comparison_summary || winner.comparison_note || "This option creates the clearest relationship between your profile, the garment, and the moment you described.")}</p><div className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">{[["Profile", `${titleCase(session.profile.undertone)} undertone · ${titleCase(session.profile.contrast)} contrast`], ["Moment", session.intent_text || "Your everyday direction"], ["Visual", winner.vto_status === "ready" ? "Rendered on you with YouCam" : "Try-on is still rendering"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f7f4ef] p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#6a5ed6]">{label}</p><p className="mt-2 text-sm leading-5 text-[#474c5a]">{value}</p></div>)}</div></section>{runner && <section className="rounded-[2rem] bg-[#e7f5df] p-7 md:p-8"><p className="eyebrow text-[#52664c]">The tradeoff</p><h2 className="mt-4 font-display text-4xl leading-[.92]">{labelFor(runner)} is still in the conversation.</h2><p className="mt-4 text-sm leading-6 text-[#5c6d56]">{cleanDisplayText(runner.comparison_note || runner.short_verdict || "A different mood, with a different balance against your profile.")}</p><button type="button" onClick={() => setActiveLook(runner)} className="mt-6 rounded-full bg-[#111827] px-4 py-2.5 text-xs font-semibold text-white">See the other read</button></section>}</div>
      </section>

      <section className="mt-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#6a5ed6]">Top directions</p><h2 className="mt-3 font-display text-5xl leading-[.9]">The pieces, in order.</h2></div><p className="max-w-sm text-right text-xs leading-5 text-[#85818a]">Undertone scores every saved piece, then uses YouCam where the visual comparison adds the most value.</p></div><div className="mt-7 grid gap-4 md:grid-cols-3">{top.map((candidate) => <button type="button" key={candidate.id} onClick={() => setActiveLook(candidate)} className="group overflow-hidden rounded-[1.8rem] border border-[#ded9d2] bg-[#fffdfa] text-left transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#3f356f]/[.07]"><div className="relative aspect-[.86] overflow-hidden bg-[#eeeae4]"><img src={candidate.vto_url || candidate.image_url} alt={labelFor(candidate)} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><span className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-[10px] font-bold ${candidate.rank === 1 ? "bg-[#caf3a6] text-[#1d2913]" : "bg-[#111827]/80 text-white"}`}>{candidate.rank === 1 ? "Top match" : `Option ${candidate.rank}`}</span></div><div className="p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-3xl leading-none">{labelFor(candidate)}</h3><span className="text-xs font-bold text-[#6a5ed6]">{Math.round(candidate.final_score)}</span></div><p className="mt-3 line-clamp-3 text-sm leading-6 text-[#6b6f7c]">{cleanDisplayText(candidate.short_verdict)}</p><span className="mt-5 inline-flex text-xs font-semibold text-[#5d50cf]">Open details ↗</span></div></button>)}</div></section>

      {session.guidance?.needed && <section className="mt-8 rounded-[2rem] border border-[#f1c788] bg-[#fff6e7] p-7 md:p-9"><p className="eyebrow text-[#a06e2b]">A better direction</p><h2 className="mt-3 font-display text-4xl leading-none">{cleanDisplayText(session.guidance.headline)}</h2><div className="mt-5 grid gap-3 md:grid-cols-3">{session.guidance.tips.map((tip) => <p key={tip} className="rounded-2xl bg-white/65 p-4 text-sm leading-6 text-[#76572e]">{cleanDisplayText(tip)}</p>)}</div></section>}

      <section className="mt-8 rounded-[2rem] bg-[#111827] p-7 text-white md:p-9"><div className="flex flex-wrap items-center justify-between gap-5"><div><p className="eyebrow text-[#cabdff]">Keep exploring</p><h2 className="mt-3 font-display text-4xl leading-none">A clear call is a starting point, not a limit.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Change the moment, add another piece from your wardrobe, or capture something new while you shop.</p></div><Link href={`/app?session=${encodeURIComponent(sessionId || "")}`} className="rounded-full bg-[#caf3a6] px-5 py-3.5 text-sm font-semibold text-[#1d2913]">Return to the board</Link></div></section>
    </main>
    <BusyOverlay message={busy} />
    <LookAnalysisModal candidate={activeLook} onClose={() => setActiveLook(null)} />
  </AppShell>;
}
