import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseOsmWayId,
  buildOverpassQuery,
  overpassWayToPolygon,
  fetchOsmWayOutline,
} from "./osm";

const validResponse = {
  elements: [
    {
      type: "way",
      id: 198458289,
      geometry: [
        { lat: 51.0, lon: 4.0 },
        { lat: 51.0, lon: 4.001 },
        { lat: 51.001, lon: 4.001 },
        { lat: 51.001, lon: 4.0 },
      ],
    },
  ],
};

describe("parseOsmWayId", () => {
  it("extracts the way ID from a full openstreetmap.org URL", () => {
    expect(parseOsmWayId("https://www.openstreetmap.org/way/198458289")).toBe(
      "198458289",
    );
  });

  it("accepts a bare numeric ID", () => {
    expect(parseOsmWayId("198458289")).toBe("198458289");
  });

  it("trims surrounding whitespace", () => {
    expect(parseOsmWayId("  198458289  ")).toBe("198458289");
  });

  it("returns null for garbage input", () => {
    expect(parseOsmWayId("not a way")).toBeNull();
    expect(parseOsmWayId("https://www.openstreetmap.org/node/42")).toBeNull();
    expect(parseOsmWayId("")).toBeNull();
  });
});

describe("buildOverpassQuery", () => {
  it("requests the way with geometry as JSON", () => {
    const query = buildOverpassQuery("198458289");
    expect(query).toContain("[out:json]");
    expect(query).toContain("way(198458289)");
    expect(query).toContain("out geom");
  });
});

describe("overpassWayToPolygon", () => {
  it("converts a way's node chain into a closed GeoJSON Polygon ring", () => {
    const polygon = overpassWayToPolygon(validResponse);
    expect(polygon.type).toBe("Polygon");
    const ring = polygon.coordinates[0];
    expect(ring[0]).toEqual([4.0, 51.0]);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
    expect(ring).toHaveLength(5);
  });

  it("keeps an already-closed ring closed without duplicating the point", () => {
    const closed = {
      elements: [
        {
          type: "way",
          geometry: [
            { lat: 51.0, lon: 4.0 },
            { lat: 51.0, lon: 4.001 },
            { lat: 51.001, lon: 4.001 },
            { lat: 51.0, lon: 4.0 },
          ],
        },
      ],
    };
    const ring = overpassWayToPolygon(closed).coordinates[0];
    expect(ring).toHaveLength(4);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it("throws when the response has no elements", () => {
    expect(() => overpassWayToPolygon({})).toThrow();
    expect(() => overpassWayToPolygon({ elements: [] })).toThrow();
  });

  it("throws when the way has an empty geometry", () => {
    expect(() =>
      overpassWayToPolygon({ elements: [{ type: "way", geometry: [] }] }),
    ).toThrow();
  });
});

describe("fetchOsmWayOutline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a query containing the way ID to the Overpass endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const polygon = await fetchOsmWayOutline("198458289");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.body).toContain("198458289");
    expect(polygon.type).toBe("Polygon");
  });

  it("throws a clear error when the Overpass API responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 504, text: async () => "" }),
    );
    await expect(fetchOsmWayOutline("198458289")).rejects.toThrow(/Overpass/);
  });

  it("includes the response body text in the error when Overpass rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 406,
        text: async () => "Not Acceptable",
      }),
    );
    await expect(fetchOsmWayOutline("198458289")).rejects.toThrow(/Not Acceptable/);
  });

  it("sends Accept and User-Agent headers so Overpass doesn't reject the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchOsmWayOutline("198458289");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers["User-Agent"]).toBeTruthy();
  });

  it("throws a clear error when the response body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      }),
    );
    await expect(fetchOsmWayOutline("198458289")).rejects.toThrow(/unreadable/);
  });
});
