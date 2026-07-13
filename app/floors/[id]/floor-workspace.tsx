"use client";

import { useState, type ComponentProps } from "react";
import { AskPanel } from "@/app/components/ask-panel";
import { FloorViewSwitcher } from "./floor-view-switcher";
import { IssuesPanel, type Issue } from "./issues-panel";
import type { ItemRef } from "./layer-panel";

type SwitcherProps = Omit<ComponentProps<typeof FloorViewSwitcher>, "highlightRef">;
type Point = { x: number; y: number };

/**
 * Client-side owner of the Issue → Floor Plan highlight link. page.tsx is a
 * server component, so this is the shared-state seam between the Issues
 * panel and the 2D/3D views: clicking an Issue card sets `highlightRef`,
 * which the canvas (and 3D view) render as a read-only subject highlight.
 *
 * Also owns the chat drawer: the ?route= query param only seeds the
 * initial route, since a route asked for from the drawer must update the
 * current view in place (no navigation) or the drawer would lose its
 * chat history.
 */
export function FloorWorkspace({
  issues,
  facilityId,
  ...switcherProps
}: SwitcherProps & { issues: Issue[]; facilityId: string }) {
  const [highlightRef, setHighlightRef] = useState<ItemRef | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [route, setRoute] = useState<{ waypoints: Point[]; ppeAreas: string[] } | null>(
    switcherProps.routeWaypoints ? { waypoints: switcherProps.routeWaypoints, ppeAreas: switcherProps.routePpeAreas } : null,
  );

  return (
    <>
      <FloorViewSwitcher
        {...switcherProps}
        routeWaypoints={route?.waypoints ?? null}
        routePpeAreas={route?.ppeAreas ?? []}
        highlightRef={highlightRef}
      />
      <IssuesPanel
        floorId={switcherProps.floorId}
        issues={issues}
        onFocusSubject={setHighlightRef}
      />

      <button
        type="button"
        onClick={() => setChatOpen((v) => !v)}
        className="fixed right-6 bottom-6 z-40 rounded-sm border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs text-[var(--color-paper)] shadow-lg"
      >
        {chatOpen ? "Close chat" : "Ask about this Floor"}
      </button>

      {chatOpen && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-[var(--color-grid)] bg-[var(--color-paper)] p-4 pb-20 shadow-xl">
          <AskPanel
            facilityId={facilityId}
            currentFloorId={switcherProps.floorId}
            onRouteReady={(_floorId, waypoints, ppeAreas) => setRoute({ waypoints, ppeAreas })}
          />
        </div>
      )}
    </>
  );
}
