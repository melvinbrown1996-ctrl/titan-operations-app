import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { locations } from "../../../db/schema";
import { requireManager } from "../../../lib/member-role";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  try {
    const db = getDb();
    const existing = await db.select().from(locations).where(eq(locations.active, true)).orderBy(asc(locations.name));
    if (!existing.length) await db.insert(locations).values({ name: "Honda SF" }).onConflictDoNothing();
    const rows = existing.length ? existing : await db.select().from(locations).where(eq(locations.active, true)).orderBy(asc(locations.name));
    return Response.json({ locations: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireManager();
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "Location name is required." }, { status: 400 });
    const [location] = await getDb().insert(locations).values({ name }).returning();
    return Response.json({ location }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
