"use client";

import { useEffect, useMemo, useState } from "react";

type Location = { id: number; name: string };
type ReadyJob = { id: string; locationId: number; stockOrVin: string; vehicle: string; purchaseOrderNumber: string | null; baseAmount: number; addOnAmount: number };
type InvoiceSummary = {
  id: string;
  locationId: number;
  locationName: string;
  periodStart: string;
  periodEnd: string;
  status: "submitted" | "paid";
  submittedAt: string;
  amount: number;
  jobCount: number;
  jobs: { id: string; stockOrVin: string; vehicle: string }[];
  payment: { checkNumber: string; amount: number; receivedAt: string } | null;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date: Date) {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export default function InvoicePanel({ open, onClose, locations, onMessage }: { open: boolean; onClose: () => void; locations: Location[]; onMessage: (message: string) => void }) {
  const [tab, setTab] = useState<"build" | "unpaid" | "paid">("build");
  const [readyJobs, setReadyJobs] = useState<ReadyJob[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [buildLocationId, setBuildLocationId] = useState<number | "">("");
  const [periodStart, setPeriodStart] = useState(() => isoDate(mondayOf(new Date())));
  const [periodEnd, setPeriodEnd] = useState(() => isoDate(new Date()));
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [paymentTarget, setPaymentTarget] = useState<Set<string>>(new Set());
  const [checkNumber, setCheckNumber] = useState("");
  const [checkAmount, setCheckAmount] = useState("");
  const [checkReceivedAt, setCheckReceivedAt] = useState(() => isoDate(new Date()));
  const [checkNotes, setCheckNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const response = await fetch("/api/invoices");
    if (!response.ok) { onMessage("The invoice queue could not be loaded."); return; }
    const data = (await response.json()) as { readyJobs: ReadyJob[]; invoices: InvoiceSummary[] };
    setReadyJobs(data.readyJobs);
    setInvoices(data.invoices);
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    setSelectedJobIds(new Set());
    setPaymentTarget(new Set());
  }, [open]);

  useEffect(() => {
    if (!buildLocationId && locations.length === 1) setBuildLocationId(locations[0].id);
  }, [locations, buildLocationId]);

  const jobsForBuildLocation = useMemo(() => readyJobs.filter((job) => job.locationId === buildLocationId), [readyJobs, buildLocationId]);
  const selectedTotal = useMemo(() => jobsForBuildLocation.filter((job) => selectedJobIds.has(job.id)).reduce((sum, job) => sum + job.baseAmount + job.addOnAmount, 0), [jobsForBuildLocation, selectedJobIds]);
  const unpaidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "submitted"), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "paid"), [invoices]);
  const paymentTotal = useMemo(() => unpaidInvoices.filter((invoice) => paymentTarget.has(invoice.id)).reduce((sum, invoice) => sum + invoice.amount, 0), [unpaidInvoices, paymentTarget]);

  function toggleJob(id: string) {
    setSelectedJobIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function toggleInvoiceForPayment(id: string) {
    setPaymentTarget((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function submitInvoice() {
    if (!buildLocationId || !selectedJobIds.size) { onMessage("Choose a location and at least one job before submitting an invoice."); return; }
    setSaving(true);
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: buildLocationId, periodStart, periodEnd, jobIds: [...selectedJobIds] }),
    });
    setSaving(false);
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { onMessage(data?.error ?? "That invoice could not be submitted."); return; }
    setSelectedJobIds(new Set());
    await refresh();
    setTab("unpaid");
    onMessage("Invoice submitted. It will show as unpaid until you record the dealership's check.");
  }

  async function submitPayment() {
    // Amounts are stored as whole dollars throughout this app (see lib/pricing.ts), not cents.
    const amount = Math.round(Number(checkAmount));
    if (!checkNumber.trim() || !amount || !paymentTarget.size) { onMessage("Enter a check number, an amount, and select the invoices it pays."); return; }
    setSaving(true);
    const response = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkNumber: checkNumber.trim(), amount, receivedAt: checkReceivedAt, notes: checkNotes.trim(), invoiceIds: [...paymentTarget] }),
    });
    setSaving(false);
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { onMessage(data?.error ?? "That payment could not be recorded."); return; }
    setCheckNumber(""); setCheckAmount(""); setCheckNotes(""); setCheckReceivedAt(isoDate(new Date())); setPaymentTarget(new Set());
    await refresh();
    onMessage("Payment recorded. Those invoices now show as paid.");
  }

  function printUnpaid() {
    const printWindow = window.open("", "titan-unpaid-invoices", "noopener,noreferrer");
    if (!printWindow) { onMessage("Your browser blocked the print window. Allow pop-ups and try again."); return; }
    const rows = unpaidInvoices.map((invoice) => `<tr><td>${escapeHtml(invoice.locationName)}</td><td>${escapeHtml(invoice.periodStart)} – ${escapeHtml(invoice.periodEnd)}</td><td>${invoice.jobCount}</td><td>${escapeHtml(money.format(invoice.amount))}</td></tr>`).join("") || "<tr><td colspan=\"4\">No unpaid invoices.</td></tr>";
    const total = money.format(unpaidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0));
    printWindow.document.write(`<!doctype html><title>Unpaid Invoices</title><style>body{font-family:Arial,sans-serif;color:#14213d;padding:28px}h1{margin:0}p{color:#667085}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;text-align:left;border-bottom:1px solid #dbe2ea;font-size:13px}th{background:#f4f6f8}@media print{body{padding:0}}</style><h1>Unpaid Invoices</h1><p>${new Date().toLocaleDateString()} · ${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"} outstanding · Total ${escapeHtml(total)}</p><table><thead><tr><th>Location</th><th>Period</th><th>Vehicles</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (!open) return null;

  return (
    <div className="backdrop">
      <section className="intake invoice-card">
        <button aria-label="Close invoices" type="button" className="close" onClick={onClose}>×</button>
        <p className="eyebrow">INVOICES</p>
        <h2>Build, submit, and track payment.</h2>
        <p>Every completed job with a purchase order lands here once. Submit it on an invoice, then record the dealership&rsquo;s check when it arrives.</p>

        <nav className="invoice-tabs">
          <button className={tab === "build" ? "selected" : ""} onClick={() => setTab("build")}>Build invoice ({readyJobs.length} ready)</button>
          <button className={tab === "unpaid" ? "selected" : ""} onClick={() => setTab("unpaid")}>Unpaid ({unpaidInvoices.length})</button>
          <button className={tab === "paid" ? "selected" : ""} onClick={() => setTab("paid")}>Paid ({paidInvoices.length})</button>
        </nav>

        {tab === "build" && (
          <div className="invoice-build">
            <div className="invoice-build-controls">
              <label>Location
                <select value={buildLocationId} onChange={(event) => { setBuildLocationId(event.target.value ? Number(event.target.value) : ""); setSelectedJobIds(new Set()); }}>
                  <option value="">Choose location</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <label>Period start<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
              <label>Period end<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
            </div>
            {!buildLocationId && <p className="empty">Choose a location to see the jobs ready to invoice.</p>}
            {buildLocationId !== "" && !jobsForBuildLocation.length && <p className="empty">Every completed, PO&rsquo;d job at this location is already on an invoice.</p>}
            {jobsForBuildLocation.length > 0 && (
              <div className="invoice-job-list">
                {jobsForBuildLocation.map((job) => (
                  <label key={job.id} className="invoice-job-row">
                    <input type="checkbox" checked={selectedJobIds.has(job.id)} onChange={() => toggleJob(job.id)} />
                    <strong>{job.stockOrVin}</strong>
                    <span>{job.vehicle || "—"}</span>
                    <span>PO {job.purchaseOrderNumber}</span>
                    <span>{money.format(job.baseAmount + job.addOnAmount)}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="invoice-build-footer">
              <span>{selectedJobIds.size} selected · {money.format(selectedTotal)}</span>
              <button className="primary" type="button" disabled={saving || !selectedJobIds.size} onClick={() => void submitInvoice()}>Submit invoice</button>
            </div>
          </div>
        )}

        {tab === "unpaid" && (
          <div className="invoice-list-tab">
            {!unpaidInvoices.length && <p className="empty">Nothing is waiting on a check.</p>}
            {unpaidInvoices.map((invoice) => (
              <label key={invoice.id} className="invoice-row">
                <input type="checkbox" checked={paymentTarget.has(invoice.id)} onChange={() => toggleInvoiceForPayment(invoice.id)} />
                <div>
                  <strong>{invoice.locationName} · {invoice.periodStart} – {invoice.periodEnd}</strong>
                  <small>{invoice.jobCount} vehicle{invoice.jobCount === 1 ? "" : "s"} · submitted {new Date(invoice.submittedAt).toLocaleDateString()}</small>
                </div>
                <b>{money.format(invoice.amount)}</b>
              </label>
            ))}
            {unpaidInvoices.length > 0 && (
              <div className="invoice-payment-form">
                <p className="eyebrow">RECORD A CHECK</p>
                <p className="muted">Selected: {paymentTarget.size} invoice{paymentTarget.size === 1 ? "" : "s"} · {money.format(paymentTotal)}</p>
                <div className="invoice-payment-fields">
                  <label>Check number<input value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} placeholder="Check #" /></label>
                  <label>Check amount<input value={checkAmount} onChange={(event) => setCheckAmount(event.target.value)} placeholder="0.00" inputMode="decimal" /></label>
                  <label>Date received<input type="date" value={checkReceivedAt} onChange={(event) => setCheckReceivedAt(event.target.value)} /></label>
                  <label>Notes <span className="optional">(optional)</span><input value={checkNotes} onChange={(event) => setCheckNotes(event.target.value)} placeholder="Remittance notes" /></label>
                </div>
                <div className="invoice-build-footer">
                  <button className="secondary" type="button" onClick={printUnpaid}>Print unpaid list</button>
                  <button className="primary" type="button" disabled={saving || !paymentTarget.size} onClick={() => void submitPayment()}>Mark selected paid</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "paid" && (
          <div className="invoice-list-tab">
            {!paidInvoices.length && <p className="empty">No paid invoices yet.</p>}
            {paidInvoices.map((invoice) => (
              <article key={invoice.id} className="invoice-row invoice-row-paid">
                <div>
                  <strong>{invoice.locationName} · {invoice.periodStart} – {invoice.periodEnd}</strong>
                  <small>{invoice.jobCount} vehicle{invoice.jobCount === 1 ? "" : "s"} · check {invoice.payment?.checkNumber} · {invoice.payment ? new Date(invoice.payment.receivedAt).toLocaleDateString() : ""}</small>
                </div>
                <b>{money.format(invoice.amount)}</b>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
