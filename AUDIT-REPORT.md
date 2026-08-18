# Titan Operations App — Audit Report
Prepared by Claude · August 17, 2026

## What I looked at

I pulled the live working copy of `titan-operations-app` from `Documents/Live Data Extraction/` on your Mac (26 commits, built through Codex on ChatGPT's Sites platform — Next.js/React on Cloudflare Workers with a D1/SQLite database via Drizzle). I also looked at the related files sitting next to it in `Live Data Extraction/`, since those turned out to matter for the "why am I still doing this by hand" question.

## The real picture: three disconnected systems

This is the most important finding, and it explains most of the manual work you're doing.

1. **The web app** (`titan-operations-app/`) is your real production system. Technicians sign in, scan a VIN, and log completed details. Managers see a live job ledger, revenue-by-technician totals, and a purchase-order workflow: paste in the dealer's PO list, it auto-matches rows to completed jobs by stock number or VIN, flags ambiguous ones for review, and lets you approve/print. This is genuinely solid and further along than a first draft usually is.
2. **A Google Sheets billing system** (`billing_automation.gs`) with its own Invoice Register and Payment History tabs, a billing queue, and exception handling — a real attempt at invoice/payment tracking. It's explicitly marked `testMode: true` and reads from a separate "Completed Vehicles" spreadsheet workflow. It has never gone live.
3. **One-off Python scripts** (`build_honda_sf_invoices.py`, `create_honda_sf_missing_po_worksheet.py`, `validate_honda_sf_release.py`) that generate the invoice and PO-gap PDFs you've been submitting to the dealership. These work by having job data **pasted as a literal text block directly into the script** each time — there's a `RAW = """...` string of job rows hardcoded at the top of the invoice script. Nothing pulls this from the app's database automatically.

None of these three talk to each other. The app has real job and PO data sitting in its database, but invoicing happens by manually re-entering or re-pasting that same data into a completely separate script or spreadsheet. That disconnect — not any single bug — is the main reason POs and invoices still require your manual attention.

## Confirmed gap: no invoice concept in the app

The app's database (`db/schema.ts`) has tables for locations, staff, jobs, PO verification, and audit events — but nothing for invoices or payments. There is no "invoice," no "paid" or "unpaid" status, nowhere. Given how you described your actual workflow (weekly invoice packets covering multiple completed jobs, submitted to the dealership, paid by a single check that lists which invoices it covers), the app can't represent that at all right now. This is the biggest thing to close.

## Code and UI issues in the app itself

- **`app/page.tsx` is a single ~600-line file with almost no line breaks** — for example, line 26 declares roughly 40 pieces of state in one line, and the entire manager dashboard UI is one continuous expression spanning lines 70–86. This isn't a length problem, it's a density problem: it's very hard to safely change one small thing without touching a giant unreadable line, which likely slows down every future Codex prompt too.
- **`app/globals.css` has duplicated CSS.** Lines 8 and 9 contain nearly the entire base stylesheet twice — same `:root` variables, same component rules, repeated almost verbatim. Looks like a prior change appended a new block instead of editing the existing one. Harmless today but it'll cause confusing "why didn't my style change anything" moments later.
- **The test suite is stale and would fail if run.** `tests/rendered-html.test.mjs` still checks for the original scaffold's placeholder ("Starter Project" title, loading skeleton, etc.), not the real app. `npm test` almost certainly fails right now, which likely means it's just not being run — so there's no safety net catching regressions before changes ship.
- **`examples/d1/`** is leftover starter-template example code (a "notes" API) that isn't part of the real app. Harmless, but worth deleting so it doesn't get mistaken for something real.
- No pagination or search on the jobs list — at 200+ vehicles a month, the manager's "live work ledger" will keep growing indefinitely on one page. Worth addressing before it becomes sluggish.

## What's already working well (worth knowing before we change things)

- Password handling is done properly: PBKDF2 with per-user salt, constant-time comparison, HttpOnly/Secure session cookies with expiry. No security red flags there.
- The PO batch-matching logic (exact stock/VIN match, falling back to last-5-digits matching, flagging ambiguous matches for manual review rather than guessing) is a genuinely good design — the issue is more likely adoption/workflow than the logic itself.
- Manager vs. technician views correctly hide dollar amounts and PO/RO numbers from technicians.
- Every PO/RO change is captured in an audit trail with a required reason when correcting an existing value — good for dealership disputes.

## Suggested path forward

1. **Consolidate on the app as the single source of truth.** Add an `invoices` table (and a join to the jobs/POs it covers) with a status of submitted/paid, plus the check reference once paid — matching how you actually get paid. Once that exists, "review production, invoices, missing POs, unpaid invoices" all become views over one database instead of three disconnected tools.
2. **Retire the Python scripts and the test-mode spreadsheet** once the app can generate the same weekly invoice PDF and PO worksheet directly from real data — no more hand-pasting job rows into a script.
3. **Clean up `page.tsx` and `globals.css`** so future changes (by either of us) are easier and safer — ideally before piling the invoicing feature on top.
4. **Fix or rewrite the test file** so there's an actual safety net before we start changing core logic.

## How we work together going forward

This project lives in a private git remote tied to ChatGPT's Sites platform, not plain GitHub, so I can't push to it directly. The workflow that works: I pull your working copy over the connection to your Mac like I did today, make the actual code changes here, and write the finished files straight back into your project folder. You (or Codex) then just review the diff and commit/push as usual — no retyping instructions back and forth between us.
