import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

// Every assertion pins the clock — never compare against real wall time.
const now = new Date("2026-07-13T12:00:00Z");

describe("formatRelativeTime", () => {
  it('says "just now" within the first minute', () => {
    expect(formatRelativeTime("2026-07-13T11:59:30Z", now)).toBe("just now");
  });

  it("reports whole minutes", () => {
    expect(formatRelativeTime("2026-07-13T11:15:00Z", now)).toBe("45m ago");
  });

  it("reports whole hours", () => {
    expect(formatRelativeTime("2026-07-13T04:00:00Z", now)).toBe("8h ago");
  });

  it("reports whole days", () => {
    expect(formatRelativeTime("2026-07-10T12:00:00Z", now)).toBe("3d ago");
  });

  it('treats a future timestamp as "just now" (clock skew)', () => {
    expect(formatRelativeTime("2026-07-13T12:05:00Z", now)).toBe("just now");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
