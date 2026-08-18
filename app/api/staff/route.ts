import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { memberCredentials, members } from "../../../db/schema";
import { hashPassword } from "../../chatgpt-auth";
import { requireManager } from "../../../lib/member-role";

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Unexpected error"; }
function normalizedEmail(value: string) { return value.trim().toLowerCase(); }

export async function GET() {
  try {
    await requireManager();
    const rows = await getDb().select({ email: members.email, displayName: members.displayName, role: members.role, active: members.active }).from(members).orderBy(asc(members.role), asc(members.displayName));
    return Response.json({ members: rows });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 403 }); }
}

export async function POST(request: Request) {
  try {
    await requireManager();
    const body = (await request.json()) as { email?: string; displayName?: string; role?: "manager" | "technician"; password?: string };
    const email = normalizedEmail(body.email ?? "");
    const displayName = body.displayName?.trim() ?? "";
    const role = body.role;
    const password = body.password ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || (role !== "manager" && role !== "technician") || password.length < 8 || password.length > 128) return Response.json({ error: "Enter a name, email, role, and a password with at least eight characters." }, { status: 400 });
    const db = getDb();
    const pinHash = await hashPassword(password);
    const createdAt = new Date().toISOString();
    await db.insert(members).values({ email, displayName, role, active: true }).onConflictDoUpdate({ target: members.email, set: { displayName, role, active: true } });
    await db.insert(memberCredentials).values({ email, pinHash, createdAt }).onConflictDoUpdate({ target: memberCredentials.email, set: { pinHash, createdAt } });
    const [member] = await db.select({ email: members.email, displayName: members.displayName, role: members.role, active: members.active }).from(members).where(eq(members.email, email));
    return Response.json({ member }, { status: 201 });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 500 }); }
}
