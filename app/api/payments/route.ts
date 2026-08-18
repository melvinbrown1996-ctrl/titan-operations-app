import { inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { invoices, payments } from "../../../db/schema";
import { requireManager } from "../../../lib/member-role";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

// Records one dealership check and marks every invoice it covers as paid. A single check
// commonly settles several weekly invoices at once, so this takes a list of invoice ids.
export async function POST(request: Request) {
  try {
    const manager = await requireManager();
    const body = (await request.json()) as { checkNumber?: string; amount?: number; receivedAt?: string; notes?: string; invoiceIds?: string[] };
    const invoiceIds = Array.isArray(body.invoiceIds) ? [...new Set(body.invoiceIds)] : [];
    const checkNumber = body.checkNumber?.trim() ?? "";
    if (!checkNumber || !Number.isFinite(body.amount) || !body.amount || !invoiceIds.length) {
      return Response.json({ error: "Enter a check number, an amount, and select at least one invoice it pays." }, { status: 400 });
    }

    const db = getDb();
    const selectedInvoices = await db.select().from(invoices).where(inArray(invoices.id, invoiceIds));
    if (selectedInvoices.length !== invoiceIds.length) return Response.json({ error: "One of the selected invoices no longer exists." }, { status: 404 });
    const alreadyPaid = selectedInvoices.find((invoice) => invoice.status === "paid");
    if (alreadyPaid) return Response.json({ error: "One of the selected invoices is already marked paid." }, { status: 409 });

    const paymentId = crypto.randomUUID();
    const receivedAt = body.receivedAt?.trim() || new Date().toISOString();
    await db.insert(payments).values({ id: paymentId, receivedAt, checkNumber, amount: Math.round(body.amount), notes: body.notes?.trim() ?? "", recordedByEmail: manager.email });
    await db.update(invoices).set({ status: "paid", paymentId }).where(inArray(invoices.id, invoiceIds));

    return Response.json({ paymentId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
