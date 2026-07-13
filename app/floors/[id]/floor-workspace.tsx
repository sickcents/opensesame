"use client";

import { useState, type ComponentProps } from "react";
import { FloorViewSwitcher } from "./floor-view-switcher";
import { IssuesPanel, type Issue } from "./issues-panel";
import type { ItemRef } from "./layer-panel";

type SwitcherProps = Omit<ComponentProps<typeof FloorViewSwitcher>, "highlightRef">;

/**
 * Client-side owner of the Issue → Floor Plan highlight link. page.tsx is a
 * server component, so this is the shared-state seam between the Issues
 * panel and the 2D/3D views: clicking an Issue card sets `highlightRef`,
 * which the canvas (and 3D view) render as a read-only subject highlight.
 */
export function FloorWorkspace({
  issues,
  ...switcherProps
}: SwitcherProps & { issues: Issue[] }) {
  const [highlightRef, setHighlightRef] = useState<ItemRef | null>(null);

  return (
    <>
      <FloorViewSwitcher {...switcherProps} highlightRef={highlightRef} />
      <IssuesPanel
        floorId={switcherProps.floorId}
        issues={issues}
        onFocusSubject={setHighlightRef}
      />
    </>
  );
}
