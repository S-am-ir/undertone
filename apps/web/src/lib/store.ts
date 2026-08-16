"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "./api";

type AppState = {
  sessionId: string | null;
  session: Session | null;
  selectedId: string | null;
  showCompare: boolean;
  showFullAnalysis: boolean;
  setSessionId: (id: string | null) => void;
  setSession: (s: Session | null) => void;
  setSelectedId: (id: string | null) => void;
  setShowCompare: (v: boolean) => void;
  setShowFullAnalysis: (v: boolean) => void;
  reset: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sessionId: null,
      session: null,
      selectedId: null,
      showCompare: false,
      showFullAnalysis: false,
      setSessionId: (id) => set({ sessionId: id }),
      setSession: (s) => set({ session: s, sessionId: s?.id ?? null }),
      setSelectedId: (id) => set({ selectedId: id }),
      setShowCompare: (v) => set({ showCompare: v }),
      setShowFullAnalysis: (v) => set({ showFullAnalysis: v }),
      reset: () =>
        set({
          sessionId: null,
          session: null,
          selectedId: null,
          showCompare: false,
          showFullAnalysis: false,
        }),
    }),
    {
      name: "undertone-session",
      partialize: (s) => ({ sessionId: s.sessionId }),
    }
  )
);
