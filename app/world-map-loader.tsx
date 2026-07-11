"use client";

import dynamic from "next/dynamic";

const WorldMap = dynamic(() => import("./world-map").then((m) => m.WorldMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] w-full items-center justify-center rounded-sm border border-[var(--color-grid)] font-mono text-xs text-[var(--color-ink-soft)]">
      Loading map…
    </div>
  ),
});

export default WorldMap;
