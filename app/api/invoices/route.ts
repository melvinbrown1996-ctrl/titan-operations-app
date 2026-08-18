import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { invoiceJobs, invoices, jobAuditEvents, jobs, locations, payments } from "../../../db/schema";
import { requireManager } from "../../../lib/member-role";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    await requireManager();
    const db = getDb();
    const locationId = new URL(request.url).searchParams.get("locationId");

    const [invoiceRows, jobRows, locationRows, paymentRows, linkRows] = await Promise.all([
      db.select().from(invoices).orderBy(desc(invoices.submittedAt)),
      db.select().from(jobs),
      db.select().from(locations),
      db.select().from(payments),
      db.select().from(invoiceJobs),
    ]);

    const jobById = new Map(jobRows.map((job) => [job.id, job]));
    const locationById = new Map(locationRows.map((location) => [location.id, location]));
    const paymentById = new Map(paymentRows.map((payment) => [payment.id, payment]));
    const jobIdsByInvoiceId = new Map<string, string[]>();
    for (const link of linkRows) jobIdsByInvoiceId.set(link.invoiceId, [...(jobIdsByInvoiceId.get(link.invoiceId) ?? []), link.jobId]);

    const billedJobIds = new Set(linkRows.map((link) => link.jobId));
    const ready = jobRows
      .filter((job) => job.purchaseOrderNumber && !billedJobIds.has(job.id))
      .filter((job) => !locationId || job.locationId === Number(locationId))
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

    const invoiceSummaries = invoiceRows
      .filter((invoice) => !locationId || invoice.locationId === Number(locationId))
      .map((invoice) => {
        const invoiceJobRows = (jobIdsByInvoiceId.get(invoice.id) ?? []).map((jobId) => jobById.get(jobId)).filter((job): job is NonNullable<typeof job> => Boolean(job));
        const amount = invoiceJobRows.reduce((sum, job) => sum + job.baseAmount + job.addOnAmount, 0);
        const payment = invoice.paymentId ? paymentById.get(invoice.paymentId) ?? null : null;
        return {
          id: invoice.id,
          locationId: invoice.locationId,
          locationName: locationById.get(invoice.locationId)?.name ?? "Location",
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          status: invoice.status,
          submittedAt: invoice.submittedAt,
          amount,
          jobCount: invoiceJobRows.length,
          jobs: invoiceJobRows.map((job) => ({ id: job.id, stockOrVin: job.stockOrVin, vehicle: job.vehicle })),
          payment: payment ? { checkNumber: payment.checkNumber, amount: payment.amount, receivedAt: payment.receivedAt } : null,
        };
      });

    return Response.json({ readyJobs: ready, invoices: invoiceSummaries });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const manager = await requireManager();
    const body = (await request.json()) as { locationId?: number; periodStart?: string; periodEnd?: string; jobIds?: string[] };
    const jobIds = Array.isArray(body.jobIds) ? [...new Set(body.jobIds)] : [];
    if (!body.locationId || !body.periodStart || !body.periodEnd || !jobIds.length) {
      return Response.json({ error: "Choose a location, a period, and at least one completed job to invoice." }, { status: 400 });
    }

    const db = getDb();
    const billedJobIds = new Set((await db.select({ jobId: invoiceJobs.jobId }).from(invoiceJobs)).map((row) => row.jobId));
    const candidateJobs = await db.select().from(jobs);
    const jobById = new Map(candidateJobs.map((job) => [job.id, job]));

    for (const jobId of jobIds) {
      const job = jobById.get(jobId);
      if (!job) return Response.json({ error: "One of the selected jobs no longer exists." }, { status: 404 });
      if (job.locationId !== body.locationId) return Response.json({ error: "All jobs on an invoice must be from the same location." }, { status: 400 });
      if (!job.purchaseOrderNumber) return Response.json({ error: `${job.stockOrVin} still needs a purchase order before it can be invoiced.` }, { status: 400 });
      if (billedJobIds.has(jobId)) return Response.json({ error: `${job.stockOrVin} is already on another invoice.` }, { status: 409 });
    }

    const invoiceId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    await db.insert(invoices).values({ id: invoiceId, locationId: body.locationId, periodStart: body.periodStart, periodEnd: body.periodEnd, status: "submitted", submittedAt, createdByEmail: manager.email });
    await db.insert(invoiceJobs).values(jobIds.map((jobId) => ({ id: crypto.randomUUID(), invoiceId, jobId })));
    await db.insert(jobAuditEvents).values(jobIds.map((jobId) => ({ id: crypto.randomUUID(), jobId, createdAt: submittedAt, eventType: "Included on submitted invoice", actorEmail: manager.email, actorName: manager.displayName || "Manager", afterValue: JSON.stringify({ invoiceId, periodStart: body.periodStart, periodEnd: body.periodEnd }) })));

    return Response.json({ invoiceId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
