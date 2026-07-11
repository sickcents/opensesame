"use client";

import dynamic from "next/dynamic";

const Floor3DView = dynamic(() => import("./floor-3d-view").then((m) => m.Floor3DView), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] w-full items-center justify-center rounded-sm border border-[var(--color-grid)] font-mono text-xs text-[var(--color-ink-soft)]">
      Loading 3D view…
    </div>
  ),
});

export default Floor3DView;
