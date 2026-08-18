# Deploying Titan Operations directly to your own Cloudflare account

This bypasses ChatGPT Sites/Codex entirely. Run every command below in your own Mac
Terminal (not through Claude) — `wrangler login` needs your real browser, and none of
this touches OpenAI's platform at all once it's done.

Project folder: `Documents/Live Data Extraction/titan-operations-app`

## 0. Check Node

```
node --version
```
Needs to be 22.13.0 or newer. If it's older, update Node first.

## 1. Install and clean up

```
cd "Documents/Live Data Extraction/titan-operations-app"
npm install
rm -rf examples _to_delete
```
(`examples/` is unused leftover starter code; `_to_delete/` is scratch litter from
Claude's session — safe to remove.)

## 2. Generate the migration for the invoice/payment feature

```
npm run db:generate
```
This creates a new file under `drizzle/`, something like `drizzle/0011_something.sql`.
Open it and skim it — it should create three new tables: `invoices`, `payments`,
`invoice_jobs`. Note the exact filename; you'll need it in step 6.

## 3. Log into your Cloudflare account

```
npx wrangler login
```
This opens a browser tab — approve access to your Cloudflare account there.

## 4. Get your account ID

```
npx wrangler whoami
```
Copy the Account ID it prints.

## 5. Create the D1 database

```
npx wrangler d1 create titan-operations-db
```
Copy the `database_id` from the output — you'll need it next.

## 6. Generate a starting Cloudflare config

This project doesn't have a `wrangler.jsonc` yet (ChatGPT Sites managed that part for
you). Generate one:

```
npx vinext build
```
This creates `wrangler.jsonc` at the project root automatically. Open it and edit:

- `"account_id"` → paste the ID from step 4
- the `d1_databases` entry → `"database_name": "titan-operations-db"`,
  `"database_id"` → paste the ID from step 5
- make sure `"compatibility_flags": ["nodejs_compat"]` is present

## 7. Apply every migration to the real database, in order

Run each of these one at a time (all in the `drizzle/` folder, oldest first):

```
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0000_lucky_warstar.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0001_shocking_hannibal_king.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0002_absurd_true_believers.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0003_lyrical_forge.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0004_fantastic_speedball.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0005_typical_agent_zero.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0006_sweet_beyonder.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0007_thankful_violations.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0008_reset_manager_pin_hash.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0009_restore_melvin_manager.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0010_legal_sunfire.sql
npx wrangler d1 execute titan-operations-db --remote --file=drizzle/0011_<whatever-step-2-generated>.sql
```

**Important:** migration `0007_thankful_violations.sql` is what actually creates your
manager login (email `melvinbrown1996@gmail.com`), and `0008_reset_manager_pin_hash.sql`
sets its current password hash. Once all of these have run, log in with your usual
email and **the last password you set for your own account in the app** — not a new
one. If you don't remember it, tell me and I'll generate one more migration that resets
it to a password you choose, same way 0008 did.

## 8. Deploy

```
npx vinext deploy
```
This prints a live `*.workers.dev` URL when it finishes — that's your app, running
entirely on your own Cloudflare account.

## 9. Verify

Open the URL, sign in, and check that a completed job, a PO entry, and the new
Invoices panel all work before relying on it day to day.

---

Once this is live and working, tell me — I can also push this codebase to a plain
GitHub repo under your own account as a second backup, so neither ChatGPT Sites nor
this Cloudflare account is a single point of failure going forward.
