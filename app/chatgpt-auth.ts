import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { authSessions, members } from "../db/schema";
import * as databaseSchema from "../db/schema";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

export const SESSION_COOKIE = "titan_staff_session";
const SESSION_DAYS = 30;

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const sessionToken = readCookie(requestHeaders.get("cookie"), SESSION_COOKIE);
  if (sessionToken) {
    const db = getDb();
    const [session] = await db.select().from(authSessions).where(and(eq(authSessions.tokenHash, await sha256(sessionToken)), gt(authSessions.expiresAt, new Date().toISOString())));
    if (session) {
      const [member] = await db.select().from(members).where(eq(members.email, session.email));
      if (member?.active) return { email: member.email, displayName: member.displayName || member.email, fullName: member.displayName || null };
    }
  }
  return null;
}

export async function createStaffSession(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !isValidPassword(password)) return null;
  const db = getDb();
  const [member] = await db.select().from(members).where(eq(members.email, normalizedEmail));
  const [credential] = await db.select().from(databaseSchema.memberCredentials).where(eq(databaseSchema.memberCredentials.email, normalizedEmail));
  if (!member?.active || !credential || !(await verifyPassword(password, credential.pinHash))) return null;
  const now = new Date();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(authSessions).values({ id: crypto.randomUUID(), tokenHash: await sha256(token), email: member.email, createdAt: now.toISOString(), expiresAt });
  return { token, expiresAt, member: { email: member.email, displayName: member.displayName || member.email, role: member.role } };
}

export async function clearStaffSession(token: string | null) {
  if (!token) return;
  const db = getDb();
  await db.delete(authSessions).where(eq(authSessions.tokenHash, await sha256(token)));
}

export async function hashPassword(password: string) {
  const salt = randomHex(16);
  return `${salt}:${await pbkdf2(password, salt)}`;
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const item = cookieHeader.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function isValidPassword(password: string) { return password.length >= 8 && password.length <= 128; }

async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  return constantTimeEqual(await pbkdf2(password, salt), expected);
}

async function pbkdf2(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return toHex(new Uint8Array(derived));
}

async function sha256(value: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function randomToken() { return randomHex(32); }
function randomHex(bytes: number) { const values = crypto.getRandomValues(new Uint8Array(bytes)); return toHex(values); }
function toHex(values: Uint8Array) { return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join(""); }
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let result = 0; for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index); return result === 0; }
