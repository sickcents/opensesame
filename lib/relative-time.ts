/**
 * Coarse "how long ago" label for Issue timestamps: "just now", "5m ago",
 * "3h ago", "3d ago". `now` is injected so tests can pin the clock; callers
 * in the app just use the default.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const diffMs = now.getTime() - then.getTime();
  // Sub-minute (and any clock-skewed future timestamp) reads as "just now".
  if (diffMs < 60_000) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
