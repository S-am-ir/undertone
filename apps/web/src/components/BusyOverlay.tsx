"use client";

export function BusyOverlay({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-card-border bg-ink px-5 py-3 text-sm text-[#f7f4f0] shadow-lg">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-soft opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-soft" />
        </span>
        {message}
      </div>
    </div>
  );
}
