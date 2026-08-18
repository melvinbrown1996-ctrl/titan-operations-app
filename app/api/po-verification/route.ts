import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { jobAuditEvents, jobs, poVerificationItems } from "../../../db/schema";
import { requireManager } from "../../../lib/member-role";

type ImportedRow = { purchaseOrderNumber: string; repairOrderNumber: string | null; sourceIdentifier: string; sourceLine: string };

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Unexpected error"; }
function clean(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, ""); }

// Dealer stock numbers sometimes carry a trailing letter suffix (a re-list or lot code, e.g.
// "5105048X" for stock 5105048). Strip it before comparing so a stock number with a suffix can
// still cross-match a technician's plain stock entry or the tail of a scanned VIN. Never strip a
// genuine 17-character VIN, since a VIN's last character is part of the VIN itself, not a
// removable suffix.
function stripStockSuffix(value: string) {
  return value.replace(/[A-Z]+$/, "");
}

// Tail-compares two identifiers instead of requiring an exact match, since one side is often a
// short dealer stock number and the other a full VIN. Uses up to the last 5 characters, but falls
// back to whatever's available (down to MIN_TAIL_LENGTH) instead of refusing to match at all when
// a stock number itself has fewer than 5 digits — the previous version bailed out entirely here,
// which is likely why short stock numbers were landing as "No match found" more than they should.
const TAIL_LENGTH = 5;
const MIN_TAIL_LENGTH = 4;
function tailKey(value: string): string | null {
  const cleaned = clean(value);
  const stripped = cleaned.length === 17 ? cleaned : stripStockSuffix(cleaned);
  if (stripped.length < MIN_TAIL_LENGTH) return null;
  return stripped.slice(-TAIL_LENGTH);
}

function parseBatch(value: string): ImportedRow[] {
  return value.split(/\r?\n/).map((sourceLine) => {
    const cells = sourceLine.split(/\t|,/).map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) return null;
    if (/^(po|p\.?o\.?|purchase order)/i.test(cells[0]) && /(stock|vin|vehicle)/i.test(cells[cells.length - 1])) return null;
    if (cells.length >= 3) return { purchaseOrderNumber: cells[0], repairOrderNumber: cells[1] || null, sourceIdentifier: cells[2], sourceLine };
    return { purchaseOrderNumber: cells[0], repairOrderNumber: null, sourceIdentifier: cells[1], sourceLine };
  }).filter((row): row is ImportedRow => Boolean(row?.purchaseOrderNumber && row.sourceIdentifier));
}

function matchRow(row: ImportedRow, candidates: (typeof jobs.$inferSelect)[]) {
  const identifier = clean(row.sourceIdentifier);
  const exact = candidates.filter((job) => clean(job.stockOrVin) === identifier);
  if (exact.length === 1) return { matchedJobId: exact[0].id, candidateJobIds: [exact[0].id], matchMethod: "Exact stock / VIN", status: "ready" as const };
  const shortKey = tailKey(identifier);
  if (!shortKey) return { matchedJobId: null, candidateJobIds: [], matchMethod: "No match found", status: "needs_review" as const };
  const shortMatches = candidates.filter((job) => tailKey(job.stockOrVin) === shortKey);
  if (shortMatches.length === 1) return { matchedJobId: shortMatches[0].id, candidateJobIds: [shortMatches[0].id], matchMethod: `Last ${shortKey.length} of stock / VIN`, status: "ready" as const };
  return { matchedJobId: null, candidateJobIds: shortMatches.map((job) => job.id), matchMethod: shortMatches.length ? "Ambiguous last-digits match" : "No match found", status: "needs_review" as const };
}

export async function GET() {
  try {
    await requireManager();
    const db = getDb();
    const items = await db.select().from(poVerificationItems).orderBy(desc(poVerificationItems.createdAt));
    const jobRows = await db.select().from(jobs);
    const jobById = new Map(jobRows.map((job) => [job.id, job]));
    return Response.json({ items: items.map((item) => ({ ...item, candidateJobIds: JSON.parse(item.candidateJobIds) as string[], matchedJob: item.matchedJobId ? jobById.get(item.matchedJobId) ?? null : null })) });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 403 }); }
}

export async function POST(request: Request) {
  try {
    const manager = await requireManager();
    const body = (await request.json()) as { batchText?: string };
    const rows = parseBatch(body.batchText ?? "");
    if (!rows.length) return Response.json({ error: "Paste rows as PO number, RO number (optional), then stock number or VIN." }, { status: 400 });
    const db = getDb();
    const availableJobs = (await db.select().from(jobs)).filter((job) => !job.purchaseOrderNumber && !job.purchaseOrderUrl);
    const createdAt = new Date().toISOString();
    const items = await Promise.all(rows.map(async (row) => {
      const result = matchRow(row, availableJobs);
      const [item] = await db.insert(poVerificationItems).values({ id: crypto.randomUUID(), createdAt, sourceLine: row.sourceLine, sourceIdentifier: row.sourceIdentifier, purchaseOrderNumber: row.purchaseOrderNumber, repairOrderNumber: row.repairOrderNumber, matchedJobId: result.matchedJobId, candidateJobIds: JSON.stringify(result.candidateJobIds), matchMethod: result.matchMethod, status: result.status, enteredByEmail: manager.email }).returning();
      return item;
    }));
    return Response.json({ items, imported: items.length, ready: items.filter((item) => item.status === "ready").length, needsReview: items.filter((item) => item.status === "needs_review").length }, { status: 201 });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const manager = await requireManager();
    const body = (await request.json()) as { id?: string; action?: "approve" | "skip" };
    if (!body.id || (body.action !== "approve" && body.action !== "skip")) return Response.json({ error: "A queue item and action are required." }, { status: 400 });
    const db = getDb();
    const [item] = await db.select().from(poVerificationItems).where(eq(poVerificationItems.id, body.id));
    if (!item) return Response.json({ error: "Queue item not found." }, { status: 404 });
    if (body.action === "skip") { await db.update(poVerificationItems).set({ status: "skipped", reviewedAt: new Date().toISOString() }).where(eq(poVerificationItems.id, item.id)); return Response.json({ ok: true }); }
    if (item.status !== "ready" || !item.matchedJobId) return Response.json({ error: "Only uniquely matched items can be approved automatically." }, { status: 400 });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, item.matchedJobId));
    if (!job || job.purchaseOrderNumber || job.purchaseOrderUrl) return Response.json({ error: "This vehicle already has a purchase order. Use Single PO / RO entry to review it." }, { status: 409 });
    await db.update(jobs).set({ purchaseOrderNumber: item.purchaseOrderNumber, repairOrderNumber: item.repairOrderNumber }).where(eq(jobs.id, job.id));
    const reviewedAt = new Date().toISOString();
    await db.update(poVerificationItems).set({ status: "approved", reviewedAt }).where(eq(poVerificationItems.id, item.id));
    await db.insert(jobAuditEvents).values({ id: crypto.randomUUID(), jobId: job.id, createdAt: reviewedAt, eventType: "PO / RO approved from verification queue", actorEmail: manager.email, actorName: manager.displayName || "Manager", afterValue: JSON.stringify({ purchaseOrderNumber: item.purchaseOrderNumber, repairOrderNumber: item.repairOrderNumber, verificationItemId: item.id }) });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 500 }); }
}
