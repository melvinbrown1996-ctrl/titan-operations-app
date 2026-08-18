import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { jobAuditEvents, jobs } from "../../../db/schema";
import { calculateServiceRevenue } from "../../../lib/pricing";
import { currentMember, requireManager } from "../../../lib/member-role";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    const member = await currentMember();
    const locationId = new URL(request.url).searchParams.get("locationId");
    const auditJobId = new URL(request.url).searchParams.get("auditJobId");
    const db = getDb();
    if (auditJobId) {
      if (member.role !== "manager") return Response.json({ error: "Manager access is required." }, { status: 403 });
      const events = await db.select().from(jobAuditEvents).where(eq(jobAuditEvents.jobId, auditJobId)).orderBy(desc(jobAuditEvents.createdAt), desc(jobAuditEvents.id));
      return Response.json({ events });
    }
    const rows = locationId
      ? await db.select().from(jobs).where(eq(jobs.locationId, Number(locationId))).orderBy(desc(jobs.completedAt), desc(jobs.id))
      : await db.select().from(jobs).orderBy(desc(jobs.completedAt), desc(jobs.id));
    return Response.json({ jobs: member.role === "manager" ? rows : rows.map((job) => ({ ...job, baseAmount: 0, addOnAmount: 0, purchaseOrderNumber: null, purchaseOrderUrl: null, repairOrderNumber: null })) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await currentMember();
    const body = (await request.json()) as { locationId?: number; stockOrVin?: string; vehicle?: string; technicianName?: string; damageNotes?: string; services?: string[] };
    const scannedValue = body.stockOrVin?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const stockOrVin = scannedValue && /^I[A-HJ-NPR-Z0-9]{17}$/.test(scannedValue) ? scannedValue.slice(1) : scannedValue;
    const pricing = calculateServiceRevenue(Array.isArray(body.services) ? body.services : []);
    if (!body.locationId || !stockOrVin || !pricing) return Response.json({ error: "Choose one detail service and an optional appearance protection add-on." }, { status: 400 });
    const db = getDb();
    const jobId = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    const technicianName = member.role === "technician" ? member.displayName || member.email : body.technicianName?.trim() ?? "";
    const [job] = await db.insert(jobs).values({ id: jobId, locationId: body.locationId, completedAt, stockOrVin, vehicle: body.vehicle?.trim() ?? "", technicianName, damageNotes: body.damageNotes?.trim() ?? "", service: pricing.service, baseAmount: pricing.baseAmount, addOnAmount: pricing.addOnAmount }).returning();
    await db.insert(jobAuditEvents).values({ id: crypto.randomUUID(), jobId, createdAt: completedAt, eventType: "Job completed", actorEmail: member.email, actorName: member.displayName || body.technicianName?.trim() || "Technician", afterValue: JSON.stringify({ stockOrVin: job.stockOrVin, vehicle: job.vehicle, technicianName: job.technicianName, damageNotes: job.damageNotes, service: job.service, baseAmount: job.baseAmount, addOnAmount: job.addOnAmount }) });
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const member = await requireManager();
    const body = (await request.json()) as { id?: string; purchaseOrderNumber?: string; repairOrderNumber?: string; correctionReason?: string };
    if (!body.id) return Response.json({ error: "Job ID is required." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(jobs).where(eq(jobs.id, body.id));
    if (!existing) return Response.json({ error: "Job not found." }, { status: 404 });
    const purchaseOrderNumber = body.purchaseOrderNumber?.trim() || null;
    const repairOrderNumber = body.repairOrderNumber?.trim() || null;
    const changed = existing.purchaseOrderNumber !== purchaseOrderNumber || existing.repairOrderNumber !== repairOrderNumber;
    if (!changed) return Response.json({ job: existing });
    const isCorrection = Boolean((existing.purchaseOrderNumber && existing.purchaseOrderNumber !== purchaseOrderNumber) || (existing.repairOrderNumber && existing.repairOrderNumber !== repairOrderNumber));
    if (isCorrection && !body.correctionReason?.trim()) return Response.json({ error: "A correction reason is required when changing a saved PO or RO." }, { status: 400 });
    const [job] = await db.update(jobs).set({ purchaseOrderNumber, repairOrderNumber }).where(eq(jobs.id, body.id)).returning();
    await db.insert(jobAuditEvents).values({ id: crypto.randomUUID(), jobId: job.id, createdAt: new Date().toISOString(), eventType: isCorrection ? "PO / RO corrected" : "PO / RO recorded", actorEmail: member.email, actorName: member.displayName || "Manager", reason: body.correctionReason?.trim() || null, beforeValue: JSON.stringify({ purchaseOrderNumber: existing.purchaseOrderNumber, repairOrderNumber: existing.repairOrderNumber }), afterValue: JSON.stringify({ purchaseOrderNumber: job.purchaseOrderNumber, repairOrderNumber: job.repairOrderNumber }) });
    return Response.json({ job });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
