"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { organizations, facilities, floors } from "@/db/schema";

export type CreateFacilityState = {
  error: string | null;
};

export async function createFacilityFromPdf(
  _prevState: CreateFacilityState,
  formData: FormData,
): Promise<CreateFacilityState> {
  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("pdf");

  if (!name) {
    return { error: "Name the facility before uploading a floor plan." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF of the first floor's plan." };
  }
  if (file.type !== "application/pdf") {
    return { error: "That file isn't a PDF. Export the floor plan as a PDF and try again." };
  }

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    return { error: "No Organization is seeded yet — run the database seed first." };
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());

  let extractUrl = process.env.EXTRACT_FLOOR_PLAN_URL;
  if (!extractUrl) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    extractUrl = `${proto}://${host}/api/extract-floor-plan`;
  }

  let svg: string;
  try {
    const res = await fetch(extractUrl, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: pdfBytes,
    });
    const payload = await res.json();
    if (!res.ok) {
      return {
        error: `Couldn't read this PDF (${payload.error ?? "unknown error"}). Try a different export.`,
      };
    }
    svg = payload.svg;
  } catch {
    return {
      error: "The floor plan extractor isn't reachable. Run `vercel dev` locally, or try again shortly.",
    };
  }

  const [facility] = await db
    .insert(facilities)
    .values({ organizationId: org.id, name })
    .returning();

  const [floor] = await db
    .insert(floors)
    .values({
      facilityId: facility.id,
      name: "Ground",
      floorPlanSvg: svg,
    })
    .returning();

  redirect(`/floors/${floor.id}`);
}
