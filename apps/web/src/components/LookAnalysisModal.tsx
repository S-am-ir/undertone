"use client";

import { useState } from "react";
/* eslint-disable @next/next/no-img-element */
import { mediaUrl, type Candidate } from "@/lib/api";
import { cleanDisplayText, titleCase } from "@/lib/styling";

function titleFor(candidate: Candidate) {
  const family = candidate.color_features?.primary_family;
  const vision = candidate.color_features?.vision;
  const garmentType = vision && typeof vision === "object" && "garment_type" in vision ? String(vision.garment_type || "").trim() : "";
  if (typeof family === "string" && family) return `${titleCase(family)}${garmentType && garmentType !== "garment" ? ` ${garmentType}` : " look"}`;
  return "This look";
}

function toneClass(tone: string) {
  return tone === "positive" ? "bg-[#31a36f]" : tone === "caution" ? "bg-[#f0a24a]" : "bg-[#7267d9]";
}

export function LookAnalysisModal({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  const [view, setView] = useState<"tryon" | "source">("tryon");
  if (!candidate) return null;
  const title = titleFor(candidate);
  const image = view === "tryon" && candidate.vto_url ? candidate.vto_url : candidate.image_url;
  const evidence = candidate.evidence || [];

  return <div className="fixed inset-0 z-50 flex items-end bg-[#0b1020]/60 p-0 backdrop-blur-md md:items-center md:justify-center md:p-6" role="dialog" aria-modal="true" aria-label={`Analysis for ${title}`}>
    <button aria-label="Close analysis" type="button" className="absolute inset-0" onClick={onClose} />
    <section className="relative grid max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-t-[2rem] bg-[#fffdfa] shadow-2xl md:grid-cols-[.95fr_1.05fr] md:rounded-[2rem]">
      <div className="relative min-h-[420px] overflow-hidden bg-[#d9d6dc] md:min-h-[740px]"><img src={mediaUrl(image)} alt={title} className="absolute inset-0 h-full w-full object-cover object-[50%_62%]" /><div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-5"><span className="rounded-full bg-[#111827]/75 px-3 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-white">{candidate.vto_url ? "YouCam visual" : "Source garment"}</span><button type="button" onClick={onClose} className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-[#242938]">Close ×</button></div><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b1020]/90 via-[#0b1020]/20 to-transparent p-7 text-white md:p-9"><p className="eyebrow text-[#caf3a6]">Your look read</p><h2 className="mt-2 font-display text-5xl leading-[.85]">{title}</h2><div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => setView("tryon")} className={`rounded-full px-3 py-2 text-xs font-semibold ${view === "tryon" ? "bg-white text-[#171b2b]" : "bg-white/10 text-white/75"}`}>On you</button><button type="button" onClick={() => setView("source")} className={`rounded-full px-3 py-2 text-xs font-semibold ${view === "source" ? "bg-white text-[#171b2b]" : "bg-white/10 text-white/75"}`}>Original garment</button></div></div></div>
      <div className="overflow-y-auto p-6 md:p-10"><div className="flex items-start justify-between gap-5"><div><p className="eyebrow text-[#6a5ed6]">{candidate.rank === 1 ? "Best direction" : `Option ${candidate.rank ?? ""}`}</p><h3 className="mt-3 max-w-md font-display text-4xl leading-[.9] text-[#111827]">{cleanDisplayText(candidate.verdict_title || "A considered option")}</h3></div><div className="rounded-2xl bg-[#efeaff] px-4 py-3 text-right"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#6a5ed6]">Overall read</p><p className="mt-1 font-display text-3xl text-[#4f45b2]">{Math.round(candidate.final_score)}</p></div></div><p className="mt-7 text-[16px] leading-7 text-[#3c4150]">{cleanDisplayText(candidate.short_verdict || "Analyze this look to see the read.")}</p>{candidate.comparison_note && <div className="mt-6 rounded-2xl bg-[#e7f5df] p-5 text-sm leading-6 text-[#51634b]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#52664c]">Where it lands</p><p className="mt-2">{cleanDisplayText(candidate.comparison_note)}</p></div>}
        {evidence.length > 0 && <div className="mt-8 border-t border-[#ebe6df] pt-7"><p className="eyebrow text-[#6a5ed6]">What shaped this read</p><div className="mt-6 space-y-6">{evidence.map((meter) => <div key={meter.key}><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[#171d2d]">{cleanDisplayText(meter.label)}</p><span className="text-xs font-bold text-[#777b88]">{Math.round(meter.score)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ece7e1]"><span className={`block h-full rounded-full ${toneClass(meter.tone)}`} style={{ width: `${meter.score}%` }} /></div><p className="mt-2 text-sm leading-6 text-[#6e6a75]">{cleanDisplayText(meter.detail)}</p></div>)}</div></div>}
        {candidate.reasons.length > 0 && <div className="mt-8 border-t border-[#ebe6df] pt-7"><p className="eyebrow text-[#6a5ed6]">Stylist notes</p><ul className="mt-5 space-y-4">{candidate.reasons.slice(0, 4).map((reason, index) => <li key={`${reason.signal}-${index}`} className="flex gap-3 text-sm leading-6 text-[#464b59]"><span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${reason.direction === "support" ? "bg-[#31a36f]" : reason.direction === "conflict" ? "bg-[#ef5c70]" : "bg-[#7267d9]"}`} /><span><span className="font-semibold text-[#292e3c]">{titleCase(reason.signal)}</span><br />{cleanDisplayText(reason.text)}</span></li>)}</ul></div>}
        <div className="mt-8 rounded-2xl border border-[#e5dfd7] bg-[#f8f5f0] p-5"><p className="text-xs font-semibold text-[#303443]">A useful read is not a verdict on you.</p><p className="mt-2 text-xs leading-5 text-[#777b88]">This is a styling interpretation of the image, your visible profile signals, and the moment you gave Undertone. Wear the color because you want to, too.</p></div>
      </div>
    </section>
  </div>;
}
