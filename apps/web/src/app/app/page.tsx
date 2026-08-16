"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
/* eslint-disable @next/next/no-img-element */
import { addCandidates, analyze, createSession, deleteCandidate, getSession, mediaUrl, seedDemo, setIntent, uploadProfile, type Candidate } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { BusyOverlay } from "@/components/BusyOverlay";
import { LookAnalysisModal } from "@/components/LookAnalysisModal";
import { cleanDisplayText, titleCase } from "@/lib/styling";

const MOMENTS = ["A date tonight", "A big interview", "A wedding weekend", "A casual reset", "A work event"];

function lookName(candidate: Candidate) {
  const family = candidate.color_features?.primary_family;
  const vision = candidate.color_features?.vision;
  const garmentType = vision && typeof vision === "object" && "garment_type" in vision
    ? String(vision.garment_type || "").trim()
    : "";
  if (typeof family === "string" && family) {
    const color = titleCase(family);
    if (garmentType && garmentType.toLowerCase() !== "garment") return `${color} ${garmentType}`;
    return `${color} look`;
  }
  if (candidate.label && !/\.(jpe?g|png|webp)$/i.test(candidate.label)) return candidate.label;
  return "Your garment";
}

function shortStatus(candidate: Candidate) {
  if (candidate.rank) return candidate.vto_status === "ready" ? `Top ${candidate.rank} · try-on ready` : `Top ${candidate.rank} · rendering`;
  if (candidate.final_score) return "Scored · no try-on yet";
  return "Ready to read";
}

export default function AppPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#f6f4ef] text-sm text-[#666b78]">Opening your styling studio…</main>}><AppPageInner /></Suspense>;
}

function AppPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const demoMode = searchParams.get("demo") === "1";
  const { sessionId, session, setSession, setSessionId, reset } = useAppStore();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [intentDraft, setIntentDraft] = useState("");
  const [activeLook, setActiveLook] = useState<Candidate | null>(null);
  const [showGarmentBoard, setShowGarmentBoard] = useState(false);
  const demoTriedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const requested = searchParams.get("session");
        const active = requested || sessionId;
        if (active) {
          const loaded = await getSession(active);
          if (cancelled) return;
          setSessionId(active);
          setSession(loaded);
          setIntentDraft(loaded.intent_text || "");
        } else {
          const created = await createSession();
          if (cancelled) return;
          setSessionId(created.id);
          setSession(await getSession(created.id));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to start Undertone. Is the API running?");
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bootstrapping || demoTriedRef.current || !sessionId || !demoMode) return;
    if (session?.profile && session.candidates.length) {
      demoTriedRef.current = true;
      router.replace(`/app/decision?session=${encodeURIComponent(sessionId)}`);
      return;
    }
    demoTriedRef.current = true;
    void loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapping, demoMode, sessionId, session]);

  const candidates = useMemo(() => session?.candidates || [], [session]);
  const ranked = useMemo(() => [...candidates].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)), [candidates]);
  const winner = ranked.find((candidate) => candidate.rank === 1) || null;
  const visibleGarments = candidates.slice(0, 4);

  async function loadDemo() {
    if (!sessionId) return;
    setBusy("Preparing a real styling decision…");
    setError(null);
    try {
      const next = await seedDemo(sessionId, true);
      setSession(next);
      setIntentDraft(next.intent_text || "");
      if (demoMode) router.replace(`/app/decision?session=${encodeURIComponent(sessionId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo could not load.");
    } finally { setBusy(null); }
  }

  useEffect(() => {
    if (!showGarmentBoard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGarmentBoard(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showGarmentBoard]);

  async function startNewSession() {
    setError(null);
    setActiveLook(null);
    setIntentDraft("");
    reset();
    setBusy("Opening a fresh styling session…");
    try {
      const created = await createSession();
      const fresh = await getSession(created.id);
      setSessionId(created.id);
      setSession(fresh);
      router.replace(`/app?session=${encodeURIComponent(created.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A fresh styling session could not be opened.");
    } finally { setBusy(null); }
  }

  async function switchSession(id: string) {
    setBusy("Opening that styling session…");
    setError(null);
    try {
      const loaded = await getSession(id);
      setSessionId(id);
      setSession(loaded);
      setIntentDraft(loaded.intent_text || "");
      router.replace(`/app?session=${encodeURIComponent(id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That session could not be opened.");
    } finally { setBusy(null); }
  }

  async function onSelfie(file: File) {
    if (!sessionId) return;
    setBusy("Reading your color signature…");
    setError(null);
    try {
      await uploadProfile(sessionId, file);
      const next = await getSession(sessionId);
      setSession(next);
      router.push(`/app/profile?session=${encodeURIComponent(sessionId)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your selfie could not be read."); }
    finally { setBusy(null); }
  }

  async function onGarments(files: FileList | null) {
    if (!sessionId || !files?.length) return;
    setBusy("Adding those looks to your board…");
    setError(null);
    try { setSession(await addCandidates(sessionId, Array.from(files))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Those garments could not be added."); }
    finally { setBusy(null); }
  }

  async function removeGarment(candidateId: string) {
    if (!sessionId) return;
    setBusy("Removing that piece…");
    try { setSession(await deleteCandidate(sessionId, candidateId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That garment could not be removed."); }
    finally { setBusy(null); }
  }

  async function makeCall() {
    if (!sessionId || !candidates.length) return;
    setBusy("Seeing the garments, your profile, and the moment together…");
    setError(null);
    try {
      if (intentDraft.trim() !== (session?.intent_text || "")) await setIntent(sessionId, intentDraft.trim());
      const next = await analyze(sessionId);
      setSession(next);
      router.push(`/app/decision?session=${encodeURIComponent(sessionId)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Undertone could not make the comparison."); }
    finally { setBusy(null); }
  }

  if (bootstrapping) return <main className="grid min-h-screen place-items-center bg-[#f6f4ef] text-sm text-[#666b78]">Opening your styling studio…</main>;

  if (!session?.profile) {
    return <Onboarding error={error} busy={busy} onSelfie={onSelfie} onDemo={loadDemo} onDismiss={() => setError(null)} />;
  }

  return (
    <AppShell active="studio" session={session} sessionId={sessionId} onNewSession={() => void startNewSession()} onSelectSession={(id) => void switchSession(id)} onDeleted={() => void startNewSession()}>
      <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow text-[#6a5ed6]">Your decision workspace</p><h1 className="mt-3 max-w-3xl font-display text-5xl leading-[.9] tracking-[-.065em] sm:text-7xl">A better answer to <span className="text-[#6a5ed6]">“will this work?”</span></h1><p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#686b78]">Bring what you already own or what you&apos;re considering online. Undertone keeps the real pieces, your color signature, and the moment in the same decision.</p></div>
          <div className="flex items-center gap-2 rounded-full border border-[#ded8d0] bg-white/70 px-3 py-2 text-xs text-[#686b78]"><span className="h-2 w-2 rounded-full bg-[#caf3a6]" />{candidates.length ? `${candidates.length} piece${candidates.length === 1 ? "" : "s"} in the room` : "Your board is ready"}</div>
        </div>

        {error && <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[#ffb9c1] bg-[#fff2f3] px-5 py-4 text-sm text-[#9b3041]">{error}<button type="button" onClick={() => setError(null)} className="font-semibold underline">Dismiss</button></div>}

        <div className="mt-10 grid items-start gap-5 xl:grid-cols-[.78fr_1.22fr]">
          <section className="overflow-hidden rounded-[2rem] bg-[#111827] p-7 text-white shadow-[0_24px_70px_rgba(17,24,39,.13)] md:p-9">
            <div className="flex items-center justify-between gap-3"><p className="eyebrow text-[#cabdff]">The styling lens</p><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-white/45">Optional</span></div>
            <h2 className="mt-5 max-w-md font-display text-5xl leading-[.9] tracking-[-.06em]">What are we getting dressed for?</h2>
            <p className="mt-5 max-w-md text-[14px] leading-7 text-white/60">Give the pieces a little context. A moment, a mood, or something you want to avoid is enough.</p>
            <div className="mt-7 rounded-[1.35rem] bg-white/10 p-2"><textarea value={intentDraft} onChange={(event) => setIntentDraft(event.target.value)} rows={4} placeholder="I have a date tonight. I want to feel polished, soft, and not too dressed up." className="w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-white outline-none placeholder:text-white/30" /><div className="flex items-center justify-between gap-3 px-3 pb-2"><span className="text-[11px] text-white/35">Your stylist is listening</span><button type="button" disabled={!intentDraft.trim() || !!busy} onClick={async () => { if (!sessionId) return; setBusy("Saving the styling lens…"); try { setSession(await setIntent(sessionId, intentDraft)); } catch (cause) { setError(cause instanceof Error ? cause.message : "The moment could not be saved."); } finally { setBusy(null); } }} className="rounded-full bg-[#caf3a6] px-4 py-2 text-xs font-bold text-[#1d2913] transition hover:-translate-y-0.5 disabled:opacity-40">Save the lens</button></div></div>
            <div className="mt-5 flex flex-wrap gap-2">{MOMENTS.map((moment) => <button key={moment} type="button" onClick={() => setIntentDraft(moment)} className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/70 transition hover:border-white/35 hover:bg-white/10">{moment}</button>)}</div>
            {session.intent && <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/70">I&apos;m reading this as <span className="font-semibold capitalize text-white">{[session.intent.vibe, session.intent.formality, session.intent.occasion].filter(Boolean).join(" · ") || "your personal moment"}</span>.</div>}
          </section>

          <section className="rounded-[2rem] border border-[#ded9d2] bg-[#fffdfa] p-7 md:p-9">
            <div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-[#6a5ed6]">Your color signature</p><h2 className="mt-3 font-display text-4xl leading-none">The person behind the choice.</h2></div><Link href={`/app/profile?session=${encodeURIComponent(sessionId || "")}`} className="rounded-full border border-[#ded8d0] px-3 py-2 text-xs font-semibold text-[#5d50cf] transition hover:bg-[#f1eefb]">Open profile</Link></div>
            <div className="mt-8 grid gap-5 sm:grid-cols-[.65fr_1.35fr] sm:items-center"><div className="relative h-40 overflow-hidden rounded-[1.4rem] bg-[#efeaff] sm:h-48"><img src={mediaUrl(session.profile.selfie_url)} alt="Your profile" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 rounded-full bg-[#111827]/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-white">Profile lens</span></div><div><p className="font-display text-4xl capitalize">{session.profile.undertone} · {session.profile.depth}</p><p className="mt-2 text-sm capitalize text-[#777b88]">{session.profile.contrast} contrast{session.profile.fitzpatrick ? ` · Fitzpatrick ${session.profile.fitzpatrick}` : ""}</p><p className="mt-5 text-sm leading-6 text-[#636775]">{cleanDisplayText(session.profile.summary)}</p><div className="mt-5 flex flex-wrap gap-2">{session.profile.palette.slice(0, 4).map((swatch) => <span key={swatch.role} className="flex items-center gap-2 rounded-full border border-[#e5dfd7] bg-[#f8f5f0] px-2.5 py-1.5 text-[10px] capitalize text-[#6d6f7b]"><span className="h-4 w-4 rounded-full border border-black/5" style={{ background: swatch.hex }} />{swatch.role}</span>)}</div></div></div>
          </section>
        </div>

        <section className="mt-5 rounded-[2rem] border border-[#ded9d2] bg-[#fffdfa] p-7 md:p-9">
          <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-[#6a5ed6]">The look board</p><h2 className="mt-3 font-display text-5xl leading-[.9] tracking-[-.055em]">Real pieces. No imaginary closet.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-[#777b88]">Upload something you own, or use the floating companion on a shopping page. Every source image stays visible here before the read.</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"><span className="text-lg text-[#caf3a6]">+</span> Add garments<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void onGarments(event.target.files)} /></label></div>
          {candidates.length === 0 ? <div className="mt-8 grid gap-4 md:grid-cols-2"><label className="flex min-h-[210px] cursor-pointer flex-col justify-between rounded-[1.5rem] border border-dashed border-[#c9c1dd] bg-[#f3efff] p-6 transition hover:border-[#8275e1] hover:bg-[#eee8ff]"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#6a5ed6] text-xl text-white">↑</span><div><p className="font-display text-3xl">Start with your wardrobe</p><p className="mt-2 max-w-sm text-sm leading-6 text-[#6c687c]">Choose saved photos or snapshots of pieces you already own.</p></div><input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void onGarments(event.target.files)} /></label><div className="flex min-h-[210px] flex-col justify-between rounded-[1.5rem] bg-[#e7f5df] p-6"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#111827] text-xl text-[#caf3a6]">U</span><div><p className="font-display text-3xl">Keep shopping open</p><p className="mt-2 max-w-sm text-sm leading-6 text-[#566353]">Use the Undertone companion to grab a garment from the product page you&apos;re browsing.</p></div></div></div> : <><div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">{visibleGarments.map((candidate) => <article key={candidate.id} className="group overflow-hidden rounded-[1.25rem] border border-[#e5dfd7] bg-[#fffdfa]"><div className="relative aspect-[.83] bg-[#eeeae4]"><img src={candidate.image_url} alt={lookName(candidate)} className="h-full w-full object-cover" /><span className={`absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[10px] font-bold ${candidate.rank ? "bg-[#caf3a6] text-[#1d2913]" : "bg-white/90 text-[#55515d]"}`}>{candidate.rank ? `Option ${candidate.rank}` : "Ready to read"}</span><button type="button" onClick={() => void removeGarment(candidate.id)} className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-[#111827]/75 text-sm text-white opacity-0 transition group-hover:opacity-100" aria-label={`Remove ${lookName(candidate)}`}>×</button></div><div className="p-3"><p className="truncate text-xs font-semibold text-[#272b38]">{lookName(candidate)}</p><p className="mt-1 truncate text-[11px] text-[#85818a]">{shortStatus(candidate)}</p></div></article>)}</div>{candidates.length > 4 && <button type="button" onClick={() => setShowGarmentBoard(true)} className="mt-5 rounded-full border border-[#dcd6ce] px-4 py-2.5 text-xs font-semibold text-[#5d50cf] transition hover:bg-[#f1eefb]">See all {candidates.length} pieces</button>}</>}
        </section>

        {winner ? <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="rounded-[2rem] bg-[#111827] p-7 text-white md:p-9"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow text-[#cabdff]">Decision ready</p><h2 className="mt-3 font-display text-5xl leading-[.9]">The board has a point of view.</h2></div><span className="grid h-12 w-12 place-items-center rounded-full bg-[#caf3a6] text-xl text-[#1d2913]">↗</span></div><p className="mt-5 max-w-xl text-sm leading-7 text-white/65">Your strongest direction is <span className="font-semibold text-white">{lookName(winner)}</span>. Open the full read to see the try-on, evidence, and tradeoffs in one calm view.</p><Link href={`/app/decision?session=${encodeURIComponent(sessionId || "")}`} className="mt-7 inline-flex rounded-full bg-[#ff6d7d] px-5 py-3.5 text-sm font-semibold text-[#2a141b] transition hover:-translate-y-0.5">Open the decision ↗</Link></div><div className="rounded-[2rem] border border-[#ded9d2] bg-[#fffdfa] p-7 md:p-9"><p className="eyebrow text-[#6a5ed6]">What shaped it</p><div className="mt-6 space-y-4">{[["01", "Your profile", `${titleCase(session.profile.undertone)} undertone · ${titleCase(session.profile.contrast)} contrast`], ["02", "Your moment", session.intent_text || "No occasion added yet"], ["03", "The real garment", lookName(winner)]].map(([number, title, body]) => <div key={number} className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#efeaff] text-[10px] font-bold text-[#5d50cf]">{number}</span><div><p className="text-xs font-semibold text-[#303443]">{title}</p><p className="mt-1 text-sm leading-5 text-[#777b88]">{body}</p></div></div>)}</div></div></section> : <section className="mt-5 grid gap-5 rounded-[2rem] bg-[#efeaff] p-7 lg:grid-cols-[1fr_auto] lg:items-center md:p-9"><div><p className="eyebrow text-[#6a5ed6]">Ready when you are</p><h2 className="mt-3 font-display text-4xl leading-none">Let&apos;s make the call.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-[#69657a]">Add a moment if you have one, then Undertone will compare the pieces against your profile and render only the strongest try-ons.</p></div><button type="button" disabled={!candidates.length || !!busy} onClick={() => void makeCall()} className="rounded-full bg-[#ff6d7d] px-6 py-4 text-sm font-bold text-[#2a141b] shadow-lg shadow-[#ff6d7d]/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{candidates.length ? "Read my looks" : "Add a garment first"}</button></section>}

        <div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="rounded-[1.5rem] border border-[#e4ded6] bg-white/55 p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6a5ed6]">01 · Profile</p><p className="mt-3 font-display text-2xl leading-none">The person changes the answer.</p></div><div className="rounded-[1.5rem] border border-[#e4ded6] bg-white/55 p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6a5ed6]">02 · Moment</p><p className="mt-3 font-display text-2xl leading-none">The occasion gives it a reason.</p></div><div className="rounded-[1.5rem] border border-[#e4ded6] bg-white/55 p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#6a5ed6]">03 · Try-on</p><p className="mt-3 font-display text-2xl leading-none">The visual makes the choice real.</p></div></div>
      </main>
      {showGarmentBoard && <div className="fixed inset-0 z-50 grid place-items-center bg-[#111827]/70 p-4 backdrop-blur-sm">
        <button type="button" aria-label="Close look board" onClick={() => setShowGarmentBoard(false)} className="absolute inset-0 cursor-default" />
        <div role="dialog" aria-modal="true" aria-labelledby="look-board-title" className="relative z-10 flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-[#fffdfa] shadow-2xl">
          <div className="flex items-start justify-between gap-5 border-b border-[#e7e1da] px-6 py-5 md:px-8">
            <div><p className="eyebrow text-[#6a5ed6]">Your look board</p><h2 id="look-board-title" className="mt-2 font-display text-4xl leading-none">Every real option.</h2><p className="mt-2 text-sm text-[#777b88]">Remove a piece here before you make the call.</p></div>
            <button type="button" onClick={() => setShowGarmentBoard(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ded8d0] text-lg text-[#4d5060] transition hover:bg-[#f1eefb]" aria-label="Close look board">×</button>
          </div>
          <div className="overflow-y-auto p-6 md:p-8"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{candidates.map((candidate) => <article key={candidate.id} className="group overflow-hidden rounded-[1.25rem] border border-[#e5dfd7] bg-[#fffdfa]"><div className="relative aspect-[.83] bg-[#eeeae4]"><img src={candidate.image_url} alt={lookName(candidate)} className="h-full w-full object-cover" /><span className={`absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[10px] font-bold ${candidate.rank ? "bg-[#caf3a6] text-[#1d2913]" : "bg-white/90 text-[#55515d]"}`}>{candidate.rank ? `Option ${candidate.rank}` : "Ready to read"}</span><button type="button" onClick={() => void removeGarment(candidate.id)} className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-[#111827]/80 text-sm text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${lookName(candidate)}`}>×</button></div><div className="p-3"><p className="truncate text-xs font-semibold text-[#272b38]">{lookName(candidate)}</p><p className="mt-1 truncate text-[11px] text-[#85818a]">{shortStatus(candidate)}</p></div></article>)}</div></div>
        </div>
      </div>}
      <BusyOverlay message={busy} />
      <LookAnalysisModal candidate={activeLook} onClose={() => setActiveLook(null)} />
    </AppShell>
  );
}

function Onboarding({
  error,
  busy,
  onSelfie,
  onDemo,
  onDismiss,
}: {
  error: string | null;
  busy: string | null;
  onSelfie: (file: File) => Promise<void>;
  onDemo: () => Promise<void>;
  onDismiss: () => void;
}) {
  return <main className="min-h-screen bg-[#f6f4ef] text-[#111827]"><header className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 lg:px-10"><Link href="/" className="font-display text-2xl tracking-[-.06em]">Undertone</Link><span className="text-xs text-[#85818a]">A private styling studio</span></header>{error && <div className="mx-auto max-w-[900px] px-5 pt-4"><div className="flex justify-between gap-4 rounded-2xl border border-[#ffb9c1] bg-[#fff2f3] px-5 py-4 text-sm text-[#9b3041]">{error}<button type="button" onClick={onDismiss} className="underline">Dismiss</button></div></div>}<section className="mx-auto grid max-w-[1220px] items-center gap-12 px-5 py-16 lg:grid-cols-[1fr_.9fr] lg:px-10 lg:py-24"><div><p className="eyebrow text-[#6a5ed6]">Step 01 · Meet your color signature</p><h1 className="mt-5 max-w-xl font-display text-6xl leading-[.87] tracking-[-.07em] lg:text-8xl">Start with the person getting dressed.</h1><p className="mt-7 max-w-xl text-lg leading-8 text-[#676b79]">One clear selfie gives Undertone the context a shopping site never has: your undertone, depth, contrast, and the skin signals that affect how a color reads today.</p><button type="button" disabled={!!busy} onClick={() => void onDemo()} className="mt-8 text-sm font-semibold text-[#6154d5] underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40">Open the finished sample decision →</button></div><label className="group flex min-h-[470px] cursor-pointer flex-col justify-between overflow-hidden rounded-[2rem] border border-dashed border-[#bdb6d4] bg-[#efeaff] p-7 transition hover:-translate-y-1 hover:bg-[#e7ddff] hover:shadow-2xl hover:shadow-[#6a5ed6]/10"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#111827] text-xl text-white">↗</span><div><p className="font-display text-4xl leading-none">Add a selfie</p><p className="mt-4 max-w-sm text-sm leading-6 text-[#5f5b72]">Good daylight. Your face visible. Nothing is shared as a public profile.</p></div><span className="inline-flex w-fit rounded-full bg-[#ff6d7d] px-5 py-3 text-sm font-semibold text-[#25121a]">Choose photo</span><input type="file" accept="image/*" capture="user" className="hidden" onChange={(event) => event.target.files?.[0] && void onSelfie(event.target.files[0])} /></label></section><BusyOverlay message={busy} /></main>;
}
