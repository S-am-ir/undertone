"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[#f6f4ef] px-5 text-center"><div><p className="eyebrow text-[#c45163]">The studio hit a pause</p><h1 className="mt-4 font-display text-5xl leading-[.9]">Your work is still safe.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#777b88]">A temporary request or rendering issue interrupted this view. Try the page again before starting over.</p><button type="button" onClick={() => reset()} className="mt-7 rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white">Try again</button></div></main>;
}

