import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseOsmWayId,
  buildOverpassQuery,
  buildNearestBuildingQuery,
  overpassWayToPolygon,
  fetchOsmWayOutline,
  fetchNearestBuildingWay,
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

  it("extracts the way ID regardless of the www. prefix", () => {
    expect(parseOsmWayId("https://openstreetmap.org/way/198458289")).toBe("198458289");
    expect(parseOsmWayId("http://www.openstreetmap.org/way/198458289")).toBe("198458289");
  });

  it("extracts the way ID with a trailing query string", () => {
    expect(
      parseOsmWayId("https://www.openstreetmap.org/way/198458289?utm_source=share"),
    ).toBe("198458289");
  });

  it("extracts the way ID with a trailing map-view fragment", () => {
    expect(
      parseOsmWayId("https://www.openstreetmap.org/way/198458289#map=18/51.0/4.0"),
    ).toBe("198458289");
  });

  it("extracts the way ID when surrounded by other pasted text", () => {
    expect(
      parseOsmWayId("see https://www.openstreetmap.org/way/198458289 for the outline"),
    ).toBe("198458289");
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

describe("buildNearestBuildingQuery", () => {
  it("requests building ways within a radius of the point", () => {
    const query = buildNearestBuildingQuery(51.0, 4.0);
    expect(query).toContain("[out:json]");
    expect(query).toContain("way(around:50,51,4)");
    expect(query).toContain('["building"]');
    expect(query).toContain("out geom");
  });

  it("accepts a custom radius", () => {
    expect(buildNearestBuildingQuery(51.0, 4.0, 100)).toContain("around:100,51,4");
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

describe("fetchNearestBuildingWay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no building way is found nearby", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) }),
    );
    await expect(fetchNearestBuildingWay(51.0, 4.0)).resolves.toBeNull();
  });

  it("picks the way whose centroid is closest to the clicked point", async () => {
    const near = {
      type: "way",
      id: 111,
      geometry: [
        { lat: 51.0, lon: 4.0 },
        { lat: 51.0, lon: 4.001 },
        { lat: 51.001, lon: 4.001 },
        { lat: 51.001, lon: 4.0 },
      ],
    };
    const far = {
      type: "way",
      id: 222,
      geometry: [
        { lat: 52.0, lon: 5.0 },
        { lat: 52.0, lon: 5.001 },
        { lat: 52.001, lon: 5.001 },
        { lat: 52.001, lon: 5.0 },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [far, near] }) }),
    );

    const result = await fetchNearestBuildingWay(51.0002, 4.0005);

    expect(result?.wayId).toBe("111");
    expect(result?.outline.type).toBe("Polygon");
  });

  it("throws a clear error when the Overpass API responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 504, text: async () => "" }),
    );
    await expect(fetchNearestBuildingWay(51.0, 4.0)).rejects.toThrow(/Overpass/);
  });
});
