import { count, eq } from "drizzle-orm";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { getDb } from "../db";
import { members } from "../db/schema";

export type MemberRole = "manager" | "technician";

export async function currentMember() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("Sign in is required.");
  const db = getDb();
  const [existing] = await db.select().from(members).where(eq(members.email, user.email));
  if (existing?.active) return existing;
  const [{ total }] = await db.select({ total: count() }).from(members);
  const role: MemberRole = total === 0 ? "manager" : "technician";
  const [member] = await db.insert(members).values({ email: user.email, displayName: user.displayName, role }).returning();
  return member;
}

export async function requireManager() {
  const member = await currentMember();
  if (member.role !== "manager") throw new Error("Manager access is required.");
  return member;
}
