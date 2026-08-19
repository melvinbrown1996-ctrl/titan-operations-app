"use client";

import { useEffect, useMemo, useState } from "react";

type Location = { id: number; name: string };
type ReadyJob = { id: string; locationId: number; stockOrVin: string; vehicle: string; technicianName: string; service: string; completedAt: string; purchaseOrderNumber: string | null; repairOrderNumber: string | null; baseAmount: number; addOnAmount: number };
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
  jobs: { id: string; stockOrVin: string; vehicle: string; service: string; purchaseOrderNumber: string | null; repairOrderNumber: string | null; baseAmount: number; addOnAmount: number }[];
  payment: { checkNumber: string; amount: number; receivedAt: string } | null;
};
type BillingTab = "overview" | "build" | "unpaid" | "paid";

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

function ageDays(invoice: InvoiceSummary) {
  return Math.floor((Date.now() - new Date(invoice.submittedAt).getTime()) / 86400000);
}

function invoiceMatches(invoice: InvoiceSummary, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    invoice.locationName.toLowerCase().includes(q) ||
    invoice.id.toLowerCase().includes(q) ||
    (invoice.payment?.checkNumber || "").toLowerCase().includes(q) ||
    invoice.jobs.some((job) => job.stockOrVin.toLowerCase().includes(q) || (job.purchaseOrderNumber || "").toLowerCase().includes(q) || (job.repairOrderNumber || "").toLowerCase().includes(q))
  );
}

export default function InvoicePanel({ open, onClose, locations, onMessage }: { open: boolean; onClose: () => void; locations: Location[]; onMessage: (message: string) => void }) {
  const [tab, setTab] = useState<BillingTab>("overview");
  const [readyJobs, setReadyJobs] = useState<ReadyJob[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [buildLocationId, setBuildLocationId] = useState<number | "">("");
  const [periodStart, setPeriodStart] = useState(() => isoDate(mondayOf(new Date())));
  const [periodEnd, setPeriodEnd] = useState(() => isoDate(new Date()));
  const [searchReady, setSearchReady] = useState("");
  const [searchUnpaid, setSearchUnpaid] = useState("");
  const [searchPaid, setSearchPaid] = useState("");
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
    setTab("overview");
    setSelectedJobIds(new Set());
    setPaymentTarget(new Set());
  }, [open]);

  useEffect(() => {
    if (!buildLocationId && locations.length === 1) setBuildLocationId(locations[0].id);
  }, [locations, buildLocationId]);

  const today = useMemo(() => { const value = new Date(); value.setHours(0, 0, 0, 0); return value; }, []);
  const currentMonday = useMemo(() => mondayOf(today), [today]);
  const thisWeekStart = isoDate(currentMonday);
  const thisWeekEnd = isoDate(today);
  const lastWeekStart = useMemo(() => { const value = new Date(currentMonday); value.setDate(value.getDate() - 7); return isoDate(value); }, [currentMonday]);
  const lastWeekEnd = useMemo(() => { const value = new Date(currentMonday); value.setDate(value.getDate() - 1); return isoDate(value); }, [currentMonday]);
  const thisMonthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const thisMonthEnd = isoDate(today);

  const jobsForBuildLocation = useMemo(() => {
    const query = searchReady.trim().toLowerCase();
    const startTime = periodStart ? new Date(`${periodStart}T00:00:00`).getTime() : -Infinity;
    const endTime = periodEnd ? new Date(`${periodEnd}T23:59:59`).getTime() : Infinity;
    return readyJobs
      .filter((job) => job.locationId === buildLocationId)
      .filter((job) => { const completed = new Date(job.completedAt).getTime(); return completed >= startTime && completed <= endTime; })
      .filter((job) => !query || job.stockOrVin.toLowerCase().includes(query) || (job.vehicle || "").toLowerCase().includes(query) || (job.purchaseOrderNumber || "").toLowerCase().includes(query) || (job.repairOrderNumber || "").toLowerCase().includes(query));
  }, [readyJobs, buildLocationId, periodStart, periodEnd, searchReady]);
  const allReadySelected = jobsForBuildLocation.length > 0 && jobsForBuildLocation.every((job) => selectedJobIds.has(job.id));
  const selectedTotal = useMemo(() => jobsForBuildLocation.filter((job) => selectedJobIds.has(job.id)).reduce((sum, job) => sum + job.baseAmount + job.addOnAmount, 0), [jobsForBuildLocation, selectedJobIds]);
  const unpaidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "submitted"), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "paid"), [invoices]);
  const filteredUnpaid = useMemo(() => unpaidInvoices.filter((invoice) => invoiceMatches(invoice, searchUnpaid)), [unpaidInvoices, searchUnpaid]);
  const filteredPaid = useMemo(() => paidInvoices.filter((invoice) => invoiceMatches(invoice, searchPaid)), [paidInvoices, searchPaid]);
  const paymentTotal = useMemo(() => unpaidInvoices.filter((invoice) => paymentTarget.has(invoice.id)).reduce((sum, invoice) => sum + invoice.amount, 0), [unpaidInvoices, paymentTarget]);

  const totalReady = useMemo(() => readyJobs.reduce((sum, job) => sum + job.baseAmount + job.addOnAmount, 0), [readyJobs]);
  const totalAwaiting = useMemo(() => unpaidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0), [unpaidInvoices]);
  const totalPaid = useMemo(() => paidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0), [paidInvoices]);
  const overdueCount = useMemo(() => unpaidInvoices.filter((invoice) => ageDays(invoice) > 30).length, [unpaidInvoices]);
  const recommendedAction = useMemo((): { text: string; cta: string | null; tab: BillingTab | null } => {
    if (readyJobs.length) return { text: `${readyJobs.length} vehicle${readyJobs.length === 1 ? "" : "s"} worth ${money.format(totalReady)} ${readyJobs.length === 1 ? "is" : "are"} ready to invoice.`, cta: "Go to Ready to invoice", tab: "build" };
    if (overdueCount) return { text: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} ${overdueCount === 1 ? "is" : "are"} over 30 days old and still unpaid. Follow up with the dealership.`, cta: "Go to Awaiting payment", tab: "unpaid" };
    if (unpaidInvoices.length) return { text: `${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"} worth ${money.format(totalAwaiting)} ${unpaidInvoices.length === 1 ? "is" : "are"} awaiting payment.`, cta: "Go to Awaiting payment", tab: "unpaid" };
    return { text: "You're all caught up — nothing needs attention right now.", cta: null, tab: null };
  }, [readyJobs.length, totalReady, overdueCount, unpaidInvoices.length, totalAwaiting]);

  function toggleJob(id: string) {
    setSelectedJobIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function toggleSelectAllReady() {
    setSelectedJobIds(allReadySelected ? new Set() : new Set(jobsForBuildLocation.map((job) => job.id)));
  }

  function toggleInvoiceForPayment(id: string) {
    setPaymentTarget((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function submitInvoice() {
    if (!buildLocationId || !selectedJobIds.size) { onMessage("Choose a location and at least one vehicle before creating an invoice batch."); return; }
    setSaving(true);
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: buildLocationId, periodStart, periodEnd, jobIds: [...selectedJobIds] }),
    });
    setSaving(false);
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { onMessage(data?.error ?? "That invoice batch could not be created."); return; }
    setSelectedJobIds(new Set());
    await refresh();
    setTab("unpaid");
    onMessage("Invoice batch created. It will show as awaiting payment until you record the dealership's check.");
  }

  async function submitPayment() {
    // Amounts are stored as whole dollars throughout this app (see lib/pricing.ts), not cents.
    const amount = Math.round(Number(checkAmount));
    if (!checkNumber.trim() || !amount || !paymentTarget.size) { onMessage("Enter a check number, an amount, and select the invoices it pays."); return; }
    if (amount !== paymentTotal) { onMessage(`That check amount (${money.format(amount)}) doesn't match the selected invoices' total (${money.format(paymentTotal)}). Adjust your selection or the amount before recording it.`); return; }
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

  function printSingleInvoice(invoice: InvoiceSummary) {
    const printWindow = window.open("", "titan-invoice", "noopener,noreferrer");
    if (!printWindow) { onMessage("Your browser blocked the print window. Allow pop-ups and try again."); return; }
    const rows = invoice.jobs.map((job) => `<tr><td>${escapeHtml(job.stockOrVin)}</td><td>${escapeHtml(job.vehicle || "—")}</td><td>${escapeHtml(job.service)}</td><td>${escapeHtml(job.purchaseOrderNumber || "—")}</td><td>${escapeHtml(job.repairOrderNumber || "—")}</td><td>${escapeHtml(money.format(job.baseAmount + job.addOnAmount))}</td></tr>`).join("") || "<tr><td colspan=\"6\">No vehicles on this invoice.</td></tr>";
    printWindow.document.write(`<!doctype html><title>Invoice - ${escapeHtml(invoice.locationName)} ${escapeHtml(invoice.periodStart)}</title><style>body{font-family:Arial,sans-serif;color:#14213d;padding:28px}h1{margin:0 0 4px}p{color:#667085;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;text-align:left;border-bottom:1px solid #dbe2ea;font-size:13px}th{background:#f4f6f8}tfoot td{font-weight:bold;border-top:2px solid #14213d;border-bottom:none}@media print{body{padding:0}}</style><h1>Titan Auto Spa — Invoice</h1><p>${escapeHtml(invoice.locationName)}</p><p>Service period: ${escapeHtml(invoice.periodStart)} – ${escapeHtml(invoice.periodEnd)}</p><p>Submitted: ${new Date(invoice.submittedAt).toLocaleDateString()} · Status: ${invoice.status === "paid" ? "Paid" : "Unpaid"}${invoice.payment ? ` · Check ${escapeHtml(invoice.payment.checkNumber)}` : ""}</p><table><thead><tr><th>Stock / VIN</th><th>Vehicle</th><th>Service</th><th>PO</th><th>RO</th><th>Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">Total</td><td>${escapeHtml(money.format(invoice.amount))}</td></tr></tfoot></table>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (!open) return null;

  return (
    <div className="backdrop">
      <section className="intake invoice-card">
        <button aria-label="Close billing desk" type="button" className="close" onClick={onClose}>×</button>
        <p className="eyebrow">BILLING DESK</p>
        <h2>One place to invoice and get paid.</h2>
        <p>Everything you need to bill the dealership and track payment — nothing else.</p>

        <nav className="invoice-tabs">
          <button className={tab === "overview" ? "selected" : ""} onClick={() => setTab("overview")}>Overview</button>
          <button className={tab === "build" ? "selected" : ""} onClick={() => setTab("build")}>Ready to invoice ({readyJobs.length})</button>
          <button className={tab === "unpaid" ? "selected" : ""} onClick={() => setTab("unpaid")}>Awaiting payment ({unpaidInvoices.length})</button>
          <button className={tab === "paid" ? "selected" : ""} onClick={() => setTab("paid")}>Paid archive ({paidInvoices.length})</button>
        </nav>

        {tab === "overview" && (
          <div className="billing-overview-tab">
            <div className="billing-overview">
              <article><p>Ready to invoice</p><strong>{money.format(totalReady)}</strong><small>{readyJobs.length} vehicle{readyJobs.length === 1 ? "" : "s"}</small></article>
              <article><p>Awaiting payment</p><strong>{money.format(totalAwaiting)}</strong><small>{unpaidInvoices.length} invoice{unpaidInvoices.length === 1 ? "" : "s"}</small></article>
              <article><p>Paid</p><strong>{money.format(totalPaid)}</strong><small>{paidInvoices.length} invoice{paidInvoices.length === 1 ? "" : "s"}</small></article>
            </div>
            <div className="billing-next-action">
              <span>{recommendedAction.text}</span>
              {recommendedAction.tab && <button type="button" className="history" onClick={() => setTab(recommendedAction.tab as BillingTab)}>{recommendedAction.cta}</button>}
            </div>
          </div>
        )}

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
            <div className="period-shortcuts">
              <button type="button" className={periodStart === thisWeekStart && periodEnd === thisWeekEnd ? "selected" : ""} onClick={() => { setPeriodStart(thisWeekStart); setPeriodEnd(thisWeekEnd); }}>This week</button>
              <button type="button" className={periodStart === lastWeekStart && periodEnd === lastWeekEnd ? "selected" : ""} onClick={() => { setPeriodStart(lastWeekStart); setPeriodEnd(lastWeekEnd); }}>Last week</button>
              <button type="button" className={periodStart === thisMonthStart && periodEnd === thisMonthEnd ? "selected" : ""} onClick={() => { setPeriodStart(thisMonthStart); setPeriodEnd(thisMonthEnd); }}>This month</button>
            </div>
            {buildLocationId !== "" && <input className="billing-search" type="search" value={searchReady} onChange={(event) => setSearchReady(event.target.value)} placeholder="Search by stock #, VIN, vehicle, PO, or RO" />}
            {!buildLocationId && <p className="empty">Choose a location to see the vehicles ready to invoice.</p>}
            {buildLocationId !== "" && !jobsForBuildLocation.length && <p className="empty">Nothing ready to invoice for this location and period.</p>}
            {jobsForBuildLocation.length > 0 && (
              <>
                <label className="select-all-row"><input type="checkbox" checked={allReadySelected} onChange={toggleSelectAllReady} /> Select all ({jobsForBuildLocation.length})</label>
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
              </>
            )}
            <div className="invoice-build-footer">
              <span>{selectedJobIds.size} selected · {money.format(selectedTotal)}</span>
              <button className="primary" type="button" disabled={saving || !selectedJobIds.size} onClick={() => void submitInvoice()}>Create invoice batch</button>
            </div>
          </div>
        )}

        {tab === "unpaid" && (
          <div className="invoice-list-tab">
            {unpaidInvoices.length > 0 && <input className="billing-search" type="search" value={searchUnpaid} onChange={(event) => setSearchUnpaid(event.target.value)} placeholder="Search by location, stock #, VIN, PO, or check number" />}
            {!unpaidInvoices.length && <p className="empty">Nothing is waiting on a check.</p>}
            {unpaidInvoices.length > 0 && !filteredUnpaid.length && <p className="empty">No invoices match that search.</p>}
            {filteredUnpaid.map((invoice) => (
              <label key={invoice.id} className={`invoice-row${ageDays(invoice) > 30 ? " overdue" : ""}`}>
                <input type="checkbox" checked={paymentTarget.has(invoice.id)} onChange={() => toggleInvoiceForPayment(invoice.id)} />
                <div>
                  <strong>{invoice.locationName} · {invoice.periodStart} – {invoice.periodEnd}</strong>
                  <small>{invoice.jobCount} vehicle{invoice.jobCount === 1 ? "" : "s"} · submitted {new Date(invoice.submittedAt).toLocaleDateString()}{ageDays(invoice) > 30 ? ` · ${ageDays(invoice)} days old` : ""}</small>
                </div>
                <b>{money.format(invoice.amount)}</b>
                <button type="button" className="history" onClick={(event) => { event.preventDefault(); event.stopPropagation(); printSingleInvoice(invoice); }}>Print</button>
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
            {paidInvoices.length > 0 && <input className="billing-search" type="search" value={searchPaid} onChange={(event) => setSearchPaid(event.target.value)} placeholder="Search by location, stock #, VIN, PO, RO, or check number" />}
            {!paidInvoices.length && <p className="empty">No paid invoices yet.</p>}
            {paidInvoices.length > 0 && !filteredPaid.length && <p className="empty">No invoices match that search.</p>}
            {filteredPaid.map((invoice) => (
              <article key={invoice.id} className="invoice-row invoice-row-paid">
                <div>
                  <strong>{invoice.locationName} · {invoice.periodStart} – {invoice.periodEnd}</strong>
                  <small>{invoice.jobCount} vehicle{invoice.jobCount === 1 ? "" : "s"} · check {invoice.payment?.checkNumber} · {invoice.payment ? new Date(invoice.payment.receivedAt).toLocaleDateString() : ""}</small>
                </div>
                <b>{money.format(invoice.amount)}</b>
                <button type="button" className="history" onClick={() => printSingleInvoice(invoice)}>Print</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
