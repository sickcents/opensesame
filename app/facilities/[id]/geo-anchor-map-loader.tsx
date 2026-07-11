"use client";

import dynamic from "next/dynamic";

const GeoAnchorMap = dynamic(
  () => import("./geo-anchor-map").then((m) => m.GeoAnchorMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-sm border border-[var(--color-grid)] font-mono text-xs text-[var(--color-ink-soft)]">
        Loading map…
      </div>
    ),
  },
);

export default GeoAnchorMap;
