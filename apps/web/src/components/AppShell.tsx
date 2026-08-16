"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteSession, listSessions, mediaUrl, type Session, type SessionSummary } from "@/lib/api";

type Section = "studio" | "profile" | "decision";

function sessionLabel(session: Session | null) {
  if (!session) return "New styling session";
  if (session.intent_text?.trim()) return session.intent_text.trim();
  return "Untitled session";
}

export function AppShell({
  children,
  active,
  session,
  sessionId,
  onNewSession,
  onSelectSession,
  onDeleted,
}: {
  children: React.ReactNode;
  active: Section;
  session: Session | null;
  sessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleted: () => void;
}) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionsOpen) return;
    void listSessions()
      .then(setSessions)
      .catch(() => setSessionsError("Sessions are temporarily unavailable."))
      .finally(() => setSessionsLoaded(true));
  }, [sessionsOpen]);

  const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : "";
  const href = (path: string) => `${path}${query}`;
  const hasDecision = Boolean(session?.candidates.some((candidate) => candidate.rank));

  async function removeSession(id: string) {
    if (!window.confirm("Delete this styling session and its saved media?")) return;
    try {
      await deleteSession(id);
      setSessions((current) => current.filter((item) => item.id !== id));
      if (id === sessionId) onDeleted();
    } catch {
      setSessionsError("That session could not be deleted.");
    }
  }

  const navItems: { key: Section; label: string; description: string; href: string; disabled?: boolean }[] = [
    { key: "studio", label: "Styling studio", description: "Build the decision", href: href("/app") },
    { key: "profile", label: "Color profile", description: "Your starting point", href: href("/app/profile") },
    { key: "decision", label: "Latest decision", description: "Your ranked read", href: href("/app/decision"), disabled: !hasDecision },
  ];

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#111827]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[268px] border-r border-[#e3ded6] bg-[#f9f7f3] lg:flex lg:flex-col">
        <div className="px-6 py-6">
          <Link href="/" className="font-display text-[23px] tracking-[-.06em]">Undertone</Link>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.17em] text-[#8a8792]">Personal styling studio</p>
        </div>

        <div className="px-4">
          <div className="rounded-[1.4rem] border border-[#e5dfd7] bg-white/65 p-3">
            <div className="flex items-center gap-3">
              {session?.profile ? (
                <span className="h-11 w-11 shrink-0 rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url(${mediaUrl(session.profile.selfie_url)})` }} />
              ) : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#efeaff] text-[#6559d7]">✦</span>}
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#202535]">{session?.profile ? `${session.profile.undertone} palette` : "Profile waiting"}</p>
                <p className="mt-1 truncate text-[11px] text-[#777b88]">{session?.profile ? `${session.profile.depth} depth · ${session.profile.contrast} contrast` : "Add a selfie to begin"}</p>
              </div>
            </div>
            <Link href={href("/app/profile")} className="mt-3 block rounded-xl bg-[#f1eefb] px-3 py-2 text-center text-[11px] font-semibold text-[#5d50cf] transition hover:bg-[#e9e4ff]">Open profile</Link>
          </div>
        </div>

        <nav className="mt-8 px-4" aria-label="Workspace navigation">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[.19em] text-[#99949a]">Workspace</p>
          <div className="mt-3 space-y-1.5">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.disabled ? "#" : item.href}
                aria-disabled={item.disabled}
                onClick={(event) => item.disabled && event.preventDefault()}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition ${item.disabled ? "cursor-not-allowed opacity-40" : active === item.key ? "bg-[#111827] text-white shadow-lg shadow-[#111827]/10" : "text-[#656976] hover:bg-white hover:text-[#202535]"}`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-bold ${active === item.key ? "bg-[#caf3a6] text-[#1c2814]" : "bg-[#efeaff] text-[#6559d7]"}`}>{item.key === "studio" ? "01" : item.key === "profile" ? "02" : "03"}</span>
                <span className="min-w-0"><span className="block text-xs font-semibold">{item.label}</span><span className={`mt-0.5 block text-[10px] ${active === item.key ? "text-white/55" : "text-[#97939b]"}`}>{item.description}</span></span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="mt-7 px-4">
          <button type="button" onClick={() => setSessionsOpen((open) => !open)} className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${sessionsOpen ? "border-[#a69bea] bg-[#f1eefb]" : "border-[#e5dfd7] bg-white/55 hover:bg-white"}`}>
            <span><span className="block text-xs font-semibold text-[#303544]">Saved sessions</span><span className="mt-1 block text-[10px] text-[#8a8792]">{sessionLabel(session)}</span></span>
            <span className="text-lg text-[#6a5ed6]">{sessionsOpen ? "−" : "+"}</span>
          </button>
          {sessionsOpen && <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-[#e5dfd7] bg-white/75 p-2">
            {!sessionsLoaded && <p className="px-2 py-3 text-xs text-[#777b88]">Loading sessions…</p>}
            {sessionsError && <p className="px-2 py-3 text-xs text-[#a04353]">{sessionsError}</p>}
            {sessionsLoaded && !sessionsError && sessions.length === 0 && <p className="px-2 py-3 text-xs text-[#777b88]">No saved sessions yet.</p>}
            {sessionsLoaded && !sessionsError && sessions.map((item) => <div key={item.id} className={`flex items-center gap-2 rounded-xl p-2 ${item.id === sessionId ? "bg-[#efeaff]" : "hover:bg-[#f7f4f0]"}`}>
              <button type="button" onClick={() => { onSelectSession(item.id); setSessionsOpen(false); }} className="min-w-0 flex-1 text-left"><p className="truncate text-[11px] font-semibold text-[#303544]">{item.title}</p><p className="mt-0.5 text-[10px] text-[#8a8792]">{item.candidate_count} saved · {item.has_profile ? "ready" : "needs selfie"}</p></button>
              <button type="button" onClick={() => void removeSession(item.id)} className="rounded-lg px-1.5 py-1 text-[10px] text-[#a04353] hover:bg-[#fff0f2]" aria-label={`Delete ${item.title}`}>×</button>
            </div>)}
          </div>}
        </div>

        <div className="mt-auto px-5 pb-6">
          <button type="button" onClick={onNewSession} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ff6d7d] px-4 py-3 text-xs font-bold text-[#2a141b] shadow-lg shadow-[#ff6d7d]/15 transition hover:-translate-y-0.5"><span className="text-base">+</span> New styling session</button>
        </div>
      </aside>

      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#e3ded6]/80 bg-[#f6f4ef]/90 px-5 py-4 backdrop-blur-xl lg:hidden">
          <Link href="/" className="font-display text-xl tracking-[-.06em]">Undertone</Link>
          <Link href={href("/app/profile")} className="flex items-center gap-2 rounded-full border border-[#ded8d0] bg-white/75 px-2 py-1.5"><span className="h-7 w-7 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${session?.profile ? mediaUrl(session.profile.selfie_url) : "/demo/profile.jpg"})` }} /><span className="text-[11px] font-semibold capitalize">{session?.profile?.undertone || "Profile"}</span></Link>
        </header>
        <div className="min-h-screen pb-24 lg:pb-0">{children}</div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-[1.4rem] border border-[#ded8d0] bg-[#fffdfa]/95 p-2 shadow-2xl backdrop-blur-xl lg:hidden" aria-label="Mobile workspace navigation">
        {navItems.map((item) => <Link key={item.key} href={item.disabled ? "#" : item.href} onClick={(event) => item.disabled && event.preventDefault()} className={`rounded-xl px-2 py-2 text-center text-[10px] font-semibold ${item.disabled ? "opacity-35" : active === item.key ? "bg-[#111827] text-white" : "text-[#6e7180]"}`}><span className="block text-sm">{item.key === "studio" ? "⌂" : item.key === "profile" ? "◉" : "↗"}</span>{item.label.split(" ")[0]}</Link>)}
        <button type="button" onClick={onNewSession} className="rounded-xl px-2 py-2 text-center text-[10px] font-semibold text-[#d14e62]"><span className="block text-sm">＋</span>New</button>
      </nav>
    </div>
  );
}
