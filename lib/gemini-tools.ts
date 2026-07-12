import { z } from "zod";
import { tool } from "ai";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { wktPolygonToPoints } from "@/lib/wkt";
import { computeWalkingPath, type AreaPolygon } from "@/lib/pathfinding";

type SubjectType = "room" | "area" | "equipment" | "safety_equipment";

type Subject = {
  type: SubjectType;
  id: string;
  label: string;
  floorId: string;
  floorName: string;
};

type SubjectRow = {
  type: string;
  id: string;
  label: string;
  floor_id: string;
  floor_name: string;
};

async function searchSubjects(facilityId: string, query: string): Promise<Subject[]> {
  const like = `%${query}%`;
  const rows = await db.execute<SubjectRow>(sql`
    SELECT 'room' as type, r.id, r.name as label, r.floor_id, f.name as floor_name
    FROM rooms r JOIN floors f ON f.id = r.floor_id
    WHERE f.facility_id = ${facilityId} AND r.name ILIKE ${like}
    UNION ALL
    SELECT 'area', a.id, a.name, a.floor_id, f.name
    FROM areas a JOIN floors f ON f.id = a.floor_id
    WHERE f.facility_id = ${facilityId} AND a.name ILIKE ${like}
    UNION ALL
    SELECT 'equipment', e.id, t.name, e.floor_id, f.name
    FROM equipment e
    JOIN equipment_types t ON t.id = e.equipment_type_id
    JOIN floors f ON f.id = e.floor_id
    WHERE f.facility_id = ${facilityId} AND t.name ILIKE ${like}
    UNION ALL
    SELECT 'safety_equipment', s.id, s.kind::text, s.floor_id, f.name
    FROM safety_equipment s JOIN floors f ON f.id = s.floor_id
    WHERE f.facility_id = ${facilityId} AND s.kind::text ILIKE ${like}
  `);
  return rows.map((r) => ({
    type: r.type as SubjectType,
    id: r.id,
    label: r.label,
    floorId: r.floor_id,
    floorName: r.floor_name,
  }));
}

async function getGeometryWkt(type: SubjectType, id: string): Promise<string | null> {
  const rows = await (type === "room"
    ? db.execute<{ wkt: string }>(sql`SELECT ST_AsText(geom) as wkt FROM rooms WHERE id = ${id}`)
    : type === "area"
      ? db.execute<{ wkt: string }>(sql`SELECT ST_AsText(geom) as wkt FROM areas WHERE id = ${id}`)
      : type === "equipment"
        ? db.execute<{ wkt: string }>(
            sql`SELECT ST_AsText(geom) as wkt FROM equipment WHERE id = ${id}`,
          )
        : db.execute<{ wkt: string }>(
            sql`SELECT ST_AsText(geom) as wkt FROM safety_equipment WHERE id = ${id}`,
          ));
  return rows[0]?.wkt ?? null;
}

/** Routing start/end: polygon subjects route from their centroid, point subjects from their point. */
async function getRoutingPoint(type: SubjectType, id: string): Promise<{ x: number; y: number } | null> {
  const rows = await (type === "room"
    ? db.execute<{ x: number; y: number }>(
        sql`SELECT ST_X(ST_Centroid(geom)) as x, ST_Y(ST_Centroid(geom)) as y FROM rooms WHERE id = ${id}`,
      )
    : type === "area"
      ? db.execute<{ x: number; y: number }>(
          sql`SELECT ST_X(ST_Centroid(geom)) as x, ST_Y(ST_Centroid(geom)) as y FROM areas WHERE id = ${id}`,
        )
      : type === "equipment"
        ? db.execute<{ x: number; y: number }>(
            sql`SELECT ST_X(geom) as x, ST_Y(geom) as y FROM equipment WHERE id = ${id}`,
          )
        : db.execute<{ x: number; y: number }>(
            sql`SELECT ST_X(geom) as x, ST_Y(geom) as y FROM safety_equipment WHERE id = ${id}`,
          ));
  return rows[0] ?? null;
}

/**
 * Structured-query tools for one Facility (ADR-0003): Gemini answers spatial
 * and status questions by calling these against Postgres/PostGIS directly —
 * exact geometry and lookups, not embeddings/RAG.
 */
export function createFacilityTools(facilityId: string) {
  return {
    searchFloorPlanItems: tool({
      description:
        "Search this Facility's Rooms, Areas, Equipment, and Safety Equipment by name or type across all Floors. Use this first when a name is ambiguous, unknown, or you need to see what exists.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Name or type to search, e.g. 'Room 101', 'server rack', 'fire extinguisher'"),
      }),
      execute: async ({ query }) => {
        const matches = await searchSubjects(facilityId, query);
        if (matches.length === 0) {
          return { matches: [], note: "No matches. Try a broader or different search term." };
        }
        return {
          matches: matches.map((m) => ({
            type: m.type,
            label: m.label,
            floor: m.floorName,
          })),
        };
      },
    }),

    getDistanceBetween: tool({
      description:
        "Get the exact real-world distance in meters between two named items (Rooms, Areas, Equipment, or Safety Equipment) on the same Floor. Computed by PostGIS ST_Distance against their real geometry, never estimated.",
      inputSchema: z.object({
        itemA: z.string().describe("Name of the first item, e.g. 'fire extinguisher' or 'server rack'"),
        itemB: z.string().describe("Name of the second item"),
      }),
      execute: async ({ itemA, itemB }) => {
        const [matchesA, matchesB] = await Promise.all([
          searchSubjects(facilityId, itemA),
          searchSubjects(facilityId, itemB),
        ]);
        if (matchesA.length === 0) return { error: `No item found matching "${itemA}".` };
        if (matchesB.length === 0) return { error: `No item found matching "${itemB}".` };

        const a = matchesA[0];
        const b = matchesB[0];
        if (a.floorId !== b.floorId) {
          return {
            error: `"${a.label}" is on Floor "${a.floorName}" and "${b.label}" is on Floor "${b.floorName}" — distance isn't directly comparable across Floors.`,
          };
        }

        const [wktA, wktB] = await Promise.all([
          getGeometryWkt(a.type, a.id),
          getGeometryWkt(b.type, b.id),
        ]);
        if (!wktA || !wktB) return { error: "Could not load geometry for one of the items." };

        const rows = await db.execute<{ meters: number }>(sql`
          SELECT ST_Distance(ST_GeomFromText(${wktA}, 0), ST_GeomFromText(${wktB}, 0)) as meters
        `);

        return {
          itemA: a.label,
          itemB: b.label,
          floor: a.floorName,
          distanceMeters: Math.round((rows[0]?.meters ?? 0) * 100) / 100,
        };
      },
    }),

    getWalkingPath: tool({
      description:
        "Compute a real walking route between two named items on the same Floor — routed through walkable Areas and Room interiors, avoiding Equipment obstacles and restricted Areas, and flagging any PPE-required Areas crossed. Returns ordered waypoints in real-world meters, total distance, and a routeUrl to view the route on the Floor Plan.",
      inputSchema: z.object({
        from: z.string().describe("Name of the starting item, e.g. 'fire extinguisher' or 'Room 101'"),
        to: z.string().describe("Name of the destination item"),
      }),
      execute: async ({ from, to }) => {
        const [matchesA, matchesB] = await Promise.all([
          searchSubjects(facilityId, from),
          searchSubjects(facilityId, to),
        ]);
        if (matchesA.length === 0) return { error: `No item found matching "${from}".` };
        if (matchesB.length === 0) return { error: `No item found matching "${to}".` };

        const a = matchesA[0];
        const b = matchesB[0];
        if (a.floorId !== b.floorId) {
          return {
            error: `"${a.label}" is on Floor "${a.floorName}" and "${b.label}" is on Floor "${b.floorName}" — a walking route can only be computed between items on the same Floor.`,
          };
        }

        const floorId = a.floorId;
        const [start, end, roomRows, areaRows, equipmentRows] = await Promise.all([
          getRoutingPoint(a.type, a.id),
          getRoutingPoint(b.type, b.id),
          db.execute<{ wkt: string }>(
            sql`SELECT ST_AsText(geom) as wkt FROM rooms WHERE floor_id = ${floorId}`,
          ),
          db.execute<{ id: string; name: string; kind: string; wkt: string }>(
            sql`SELECT id, name, kind, ST_AsText(geom) as wkt FROM areas WHERE floor_id = ${floorId}`,
          ),
          db.execute<{ id: string; x: number; y: number; width_m: number; depth_m: number }>(sql`
            SELECT e.id, ST_X(e.geom) as x, ST_Y(e.geom) as y, t.width_m, t.depth_m
            FROM equipment e
            JOIN equipment_types t ON t.id = e.equipment_type_id
            WHERE e.floor_id = ${floorId}
          `),
        ]);
        if (!start || !end) return { error: "Could not load geometry for one of the items." };

        // A routed-to/from Equipment's own footprint must not block its own endpoint.
        const routedEquipmentIds = new Set(
          [a, b].filter((s) => s.type === "equipment").map((s) => s.id),
        );

        const result = computeWalkingPath({
          rooms: roomRows.map((r) => ({ points: wktPolygonToPoints(r.wkt) })),
          areas: areaRows.map((r) => ({
            id: r.id,
            points: wktPolygonToPoints(r.wkt),
            kind: r.kind as AreaPolygon["kind"],
          })),
          obstacles: equipmentRows
            .filter((e) => !routedEquipmentIds.has(e.id))
            .map((e) => ({ x: e.x, y: e.y, widthM: e.width_m, depthM: e.depth_m })),
          start,
          end,
        });
        if (!result) {
          return {
            error: `No walkable route exists between "${a.label}" and "${b.label}" — they may be separated by restricted Areas or unmodeled space.`,
          };
        }

        const waypoints = result.waypoints.map((p) => ({
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
        }));
        const ppeRequiredAreas = result.ppeRequiredAreaIds
          .map((id) => areaRows.find((r) => r.id === id)?.name)
          .filter((n): n is string => !!n);
        const routeUrl = `/floors/${floorId}?route=${encodeURIComponent(
          JSON.stringify({ waypoints, ppeAreas: ppeRequiredAreas }),
        )}`;

        return {
          from: a.label,
          to: b.label,
          floor: a.floorName,
          floorId,
          distanceMeters: Math.round(result.distanceMeters * 100) / 100,
          waypoints,
          ppeRequiredAreas,
          routeUrl,
        };
      },
    }),

    getOpenIssuesInRoom: tool({
      description:
        "List open Issues in a Room — both Issues reported directly on the Room and Issues on any Equipment or Safety Equipment physically located inside it, found via PostGIS ST_Contains.",
      inputSchema: z.object({
        roomName: z.string().describe("The Room's name, e.g. 'Room 204'"),
      }),
      execute: async ({ roomName }) => {
        const rooms = await db.execute<{ id: string; name: string; floor_name: string }>(sql`
          SELECT r.id, r.name, f.name as floor_name
          FROM rooms r JOIN floors f ON f.id = r.floor_id
          WHERE f.facility_id = ${facilityId} AND r.name ILIKE ${`%${roomName}%`}
          LIMIT 1
        `);
        if (rooms.length === 0) return { error: `No Room found matching "${roomName}".` };
        const room = rooms[0];

        const issues = await db.execute<{
          description: string;
          department: string;
          reporter_name: string;
          created_at: string;
        }>(sql`
          SELECT i.description, i.department, i.reporter_name, i.created_at
          FROM issues i
          WHERE i.status = 'open' AND (
            (i.subject_type = 'room' AND i.subject_id = ${room.id})
            OR (i.subject_type = 'equipment' AND EXISTS (
              SELECT 1 FROM equipment e WHERE e.id = i.subject_id
              AND ST_Contains((SELECT geom FROM rooms WHERE id = ${room.id}), e.geom)
            ))
            OR (i.subject_type = 'safety_equipment' AND EXISTS (
              SELECT 1 FROM safety_equipment s WHERE s.id = i.subject_id
              AND ST_Contains((SELECT geom FROM rooms WHERE id = ${room.id}), s.geom)
            ))
          )
          ORDER BY i.created_at DESC
        `);

        return {
          room: room.name,
          floor: room.floor_name,
          openIssueCount: issues.length,
          issues,
        };
      },
    }),
  };
}
