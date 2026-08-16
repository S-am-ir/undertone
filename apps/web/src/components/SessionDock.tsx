"use client";

import { useEffect, useState } from "react";
import { deleteSession, listSessions, type SessionSummary } from "@/lib/api";

export function SessionDock({
  activeId,
  onSelect,
  onDeleted,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoaded(true));
  }, [open]);

  async function remove(id: string) {
    if (!window.confirm("Delete this styling session and its saved media?")) return;
    await deleteSession(id);
    setSessions((current) => current.filter((session) => session.id !== id));
    if (id === activeId) onDeleted();
  }

  return (
    <div className="fixed bottom-5 left-5 z-40">
      {open && <div className="mb-3 w-[min(360px,calc(100vw-2.5rem))] rounded-[1.5rem] border border-[#ded9d2] bg-[#fffdfa]/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#6a5ed6]">Your sessions</p><p className="mt-1 text-xs text-[#777b88]">Switch between saved styling decisions.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-lg leading-none text-[#777b88] hover:bg-[#f1eefb]" aria-label="Close sessions">×</button></div>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{!loaded ? <p className="px-3 py-4 text-sm text-[#777b88]">Loading sessions…</p> : sessions.length === 0 ? <p className="px-3 py-4 text-sm text-[#777b88]">No saved sessions yet.</p> : sessions.map((session) => <div key={session.id} className={`flex items-center gap-2 rounded-2xl border p-2 ${session.id === activeId ? "border-[#9b8df0] bg-[#f1eefb]" : "border-[#e7e1d9] bg-white"}`}><button type="button" onClick={() => onSelect(session.id)} className="min-w-0 flex-1 px-2 py-1 text-left"><p className="truncate text-xs font-semibold capitalize text-[#222735]">{session.title}</p><p className="mt-1 text-[11px] text-[#777b88]">{session.candidate_count} saved · {session.has_profile ? "profile ready" : "needs a selfie"}</p></button><button type="button" onClick={() => void remove(session.id)} className="rounded-full px-2 py-1 text-xs text-[#9b3041] hover:bg-[#fff0f2]" aria-label={`Delete ${session.title}`}>Delete</button></div>)}</div>
      </div>}
      <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-full border border-[#ded9d2] bg-[#111827] px-4 py-3 text-xs font-semibold text-white shadow-xl transition hover:-translate-y-0.5">{open ? "Close sessions" : "Sessions"}</button>
    </div>
  );
}
