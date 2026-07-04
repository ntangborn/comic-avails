# Comic Avails Tracker — Step-by-Step Build Guide
**Companion to:** comic-avails-prd.md (v0.2)
**Format:** Non-coder walkthrough. Every step tells you what to do, where to do it, what to paste, and how to know it worked.
**Your tools:** Terminal + Claude Code do the coding. You do the checking and deciding.

---

## Part 0 — Prerequisites (one-time setup, ~45 minutes)

You may already have most of this from Ghost Guide and LotMonster. Skim and skip what's done.

### 0.1 Check Node.js
1. Open your terminal (Mac: press Cmd+Space, type "Terminal", hit Enter. Windows: open "PowerShell" from the Start menu).
2. Type `node -v` and press Enter.
3. **If you see `v20` or higher** (e.g., `v20.11.0` or `v22.x`): you're done, skip to 0.2.
4. **If you see an error or a lower number:** go to **https://nodejs.org** in your browser, click the big green button labeled **"LTS"**, download, and run the installer clicking Next/Accept through everything. Then **close and reopen your terminal** and run `node -v` again to confirm.

### 0.2 Check Claude Code
1. In your terminal, type `claude --version` and press Enter.
2. **If you see a version number:** done, skip to 0.3.
3. **If you see an error:** type `npm install -g @anthropic-ai/claude-code` and press Enter. Wait for it to finish, then run `claude --version` again. If it asks you to log in, follow the prompts (it opens your browser to sign in with your Anthropic account).

### 0.3 Accounts you need (all free to start)
- **Supabase** — you have one (Ghost Guide, LotMonster). Just confirm you can log in at **https://supabase.com/dashboard**.
- **Vercel** — same, confirm login at **https://vercel.com/dashboard**.
- **GitHub** — same, confirm at **https://github.com**.
- **Anthropic API key** — you have one from Ghost Host. Find it: go to **https://console.anthropic.com**, click **API Keys** in the left sidebar. If you can't find your existing key, click **Create Key**, name it `comic-avails`, and copy it somewhere safe (a note, 1Password, wherever you keep the Ghost Guide keys). You can't view a key again after closing the window — only create new ones.

### 0.4 Create the Supabase project
1. Go to **https://supabase.com/dashboard** and click **New Project** (green button, top right).
2. Name: `comic-avails`. Database password: click **Generate a password** and **save it in your password manager** — you rarely need it, but when you do, you really do.
3. Region: pick the same one as Ghost Guide (probably an East US region). Click **Create new project** and wait ~2 minutes while it provisions.
4. When it's ready, gather three things (Supabase replaced its old anon/service_role key system in 2025 — new projects only have the new-style keys):
   - **Project URL:** Go to **Settings → Data API**. The URL shown there (`https://your-project.supabase.co`) is your Project URL — if what you see has anything after `.supabase.co` (like `/rest/v1`), drop that suffix. Shortcut: the **Connect** button at the top of the dashboard → **App Frameworks → Next.js** shows the exact URL and publishable key ready to copy.
   - **Publishable key:** Go to **Settings → API Keys**, on the **"Publishable and secret API keys"** tab (not "Legacy"). If none exists yet, click **Create new API Keys**. Copy the key starting with `sb_publishable_` — this is the client-side key (the old "anon" equivalent).
   - **Secret key:** Same page, **Secret keys** section → **Create secret key**. Name it `ingest-scripts`. Copy it immediately (starts with `sb_secret_`) — you can't view it again after closing. This is the server-only key (the old "service_role" equivalent): it bypasses all security rules, treat it like a password.

**✅ Part 0 gate:** `node -v` shows v20+, `claude --version` works, Supabase project exists, you have your Anthropic API key copied.

---

## Part 1 — Create the project (~30 minutes)

### 1.1 Make the app skeleton
1. In your terminal, go to wherever you keep projects. If that's a folder called `projects` in your home directory, type: `cd ~/projects` (Mac) — adjust to wherever Ghost Guide lives.
2. Type: `npx create-next-app@latest comic-avails` and press Enter.
3. It will ask a series of yes/no questions. Answer:
   - TypeScript? **Yes**
   - ESLint? **Yes**
   - Tailwind CSS? **Yes**
   - `src/` directory? **Yes**
   - App Router? **Yes**
   - Turbopack? **Yes** (or accept default)
   - Customize import alias? **No**
4. When it finishes, type `cd comic-avails` to move into the new folder.

### 1.2 Create your secrets file
1. In the terminal (inside the `comic-avails` folder), type: `touch .env.local` (Mac) or `ni .env.local` (Windows PowerShell).
2. Open the project in your editor: type `code .` if you use VS Code, or just open the folder in whatever editor you use.
3. Click on `.env.local` in the file list and paste this in, replacing each placeholder with the real values from your Supabase API settings tab (0.4) and your Anthropic key (0.3):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_paste-here
SUPABASE_SECRET_KEY=sb_secret_paste-here
ANTHROPIC_API_KEY=paste-anthropic-key-here
```

**Note for Claude Code:** whenever a prompt in this guide (or Claude Code itself) refers to the "anon key" or "service role key," tell it: *"This project uses Supabase's new API keys — NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY replaces the anon key, and SUPABASE_SECRET_KEY replaces the service_role key. They're drop-in substitutes in supabase-js."*

4. Save the file. **This file never gets committed to GitHub** — Next.js already lists it in `.gitignore`, so you're safe by default. Don't rename it.

### 1.3 Put it on GitHub
1. In the terminal, type `claude` and press Enter to start Claude Code inside the project.
2. Paste this prompt:

> Initialize this repo with git, make an initial commit, and create a private GitHub repo called comic-avails under my account and push to it. Confirm .env.local is gitignored before committing.

3. Claude Code may ask permission to run commands — approve them. If it says the GitHub CLI (`gh`) isn't installed or logged in, it will tell you what to do; typically that's installing from **https://cli.github.com** (download, run installer) and then running `gh auth login` in the terminal and following the browser prompts.

**✅ Part 1 gate:** You can see the `comic-avails` repo on github.com under your account, and it does NOT contain a `.env.local` file.

---

## Part 2 — Build the database (~30 minutes)

This is PRD §6.1. The database is where every solicited comic lives.

### 2.1 Have Claude Code write the schema
With Claude Code running in the project (type `claude` in the terminal if it's not), paste:

> Read the file comic-avails-prd.md, section 6.1 (I'll add it to the repo — ask me if it's missing). Create a Supabase SQL migration implementing that schema. Requirements:
> - foc_date and street_date are DATE columns; create an index on foc_date because the app's default view queries a 7-day FOC range
> - items.status is an enum: solicited, foc_passed, shipped, delayed, cancelled, resolicited
> - publisher_distributor has effective_from and effective_to dates so distributor changes are data, not code
> - Add a unique constraint on items for (publisher_id, series_id, issue_number, variant_code) to prevent duplicate ingests
> - Enable Row Level Security on all tables. Public read on catalog tables (publishers, series, items, creators, item_creators). pull_lists, pull_list_items, and subscriptions readable/writable only by the owning user.
> - Seed the publishers table with: Marvel, DC, Image, Dark Horse, Boom! Studios, IDW, Titan, Dynamite, Oni Press, Mad Cave. Seed distributors with: Lunar, Penguin Random House, Universal. Seed publisher_distributor per the mapping table in PRD section 4.1, including Oni's switch from Lunar to PRH effective 2026-08-01.
> Save it as a single SQL file in supabase/migrations/ and show me the file when done.

(First, drag the `comic-avails-prd.md` file you downloaded into the project folder so Claude Code can read it.)

### 2.2 Run the migration
The simplest non-coder path is the Supabase dashboard:
1. In the Supabase dashboard, click **SQL Editor** in the left sidebar (the `>_` icon).
2. Open the migration file Claude Code created (in `supabase/migrations/`), copy its entire contents, paste into the SQL Editor, and click **Run** (bottom right).
3. If you see green "Success" — done. If you see a red error, copy the whole error message and paste it to Claude Code with: *"The migration failed in the Supabase SQL editor with this error — fix the migration file and give me the corrected SQL to run."* Repeat until green.

### 2.3 Verify
1. In the Supabase dashboard, click **Table Editor** (grid icon, left sidebar).
2. You should see all the tables: publishers, distributors, publisher_distributor, series, items, creators, item_creators, pull_lists, pull_list_items, subscriptions, ingest_runs.
3. Click **publishers** — you should see 10 rows. Click **publisher_distributor** — Oni should appear twice (Lunar ending 2026-07-31, PRH starting 2026-08-01).

**✅ Part 2 gate:** All tables visible, publishers seeded, Oni has two dated distributor rows.

---

## Part 3 — First ingest: DC solicits (~2–3 hours, the make-or-break step)

We build ONE publisher's parser first and get it trustworthy before cloning it. DC first (Lunar solicits are well-structured and DC's FOC discipline is good).

### 3.1 Pick the source page
1. In your browser, find the most recent monthly DC solicitations post on a solicit aggregator (e.g., comicreleases.com posts "DC [Month] 2026 Solicitations" — these include FOC dates). Copy the URL.
2. Sanity-read the page yourself for two minutes: confirm each item has a title, creators, price, and that FOC/in-store dates are present.

### 3.2 Have Claude Code build the ingest script
Paste into Claude Code (swap in your URL):

> Build scripts/ingest-dc.ts, runnable with: npx tsx scripts/ingest-dc.ts <url>
> It should:
> 1. Fetch the HTML of the solicit page at the URL (start with this one: PASTE-URL-HERE)
> 2. Strip it down to the main article text
> 3. Send it to the Anthropic API (model claude-sonnet-4-6, key in ANTHROPIC_API_KEY) with a prompt that extracts every solicited item into a strict JSON array. Fields per item: series_name, issue_number, title_raw, format (single_issue | trade_paperback | hardcover | omnibus | other), variant_code (A, B, C... or null), price_cents (integer, null if unknown), street_date (YYYY-MM-DD or null), foc_date (YYYY-MM-DD or null), writers (array), artists (array), cover_artists (array), solicit_text. Instruct the model to return ONLY JSON, no prose. If the page is long, chunk it and merge results.
> 4. Validate every row before writing: dates must parse, foc_date must be BEFORE street_date, price_cents between 99 and 50000 for single issues, series_name non-empty. Invalid rows go to a rejects array printed at the end, NOT into the database.
> 5. Upsert valid rows into Supabase using the SUPABASE_SECRET_KEY env var (Supabase's new secret key format, the service_role replacement — drop-in compatible with supabase-js) against the unique constraint, linking/creating series and creators. Record a row in ingest_runs with counts.
> 6. Print a summary: X extracted, Y upserted, Z rejected (with reasons).
> Don't build any UI yet.

### 3.3 Run it
1. In the terminal: `npx tsx scripts/ingest-dc.ts https://the-url-you-picked`
2. Watch the summary. A healthy first run looks like: 150–300 extracted, 90%+ upserted, a handful of rejects with sensible reasons.
3. **If it errors out entirely:** copy the full error text into Claude Code with *"this failed with the following error, diagnose and fix."* This loop — run, paste error, fix — is normal and might take a few rounds.

### 3.4 Trust check (do not skip)
1. Supabase → Table Editor → **items**. Sort by foc_date.
2. Open League of Comic Geeks or the original solicit page side-by-side and hand-check **10 items**: right issue number? right price? FOC date matches? Variants split correctly?
3. If something's systematically wrong (e.g., all omnibuses tagged as trades), tell Claude Code exactly what pattern is wrong: *"Omnibus editions are being classified as trade_paperback — adjust the extraction prompt's format rules and re-run."* The script's upsert design means re-running is safe.

**✅ Part 3 gate:** One month of DC solicits in the database, 10/10 hand-checked items correct, rejects list makes sense.

### 3.5 Clone for Marvel and Image
Paste into Claude Code:

> ingest-dc.ts is validated. Refactor the shared logic into scripts/lib/ingest-core.ts, then create scripts/ingest-marvel.ts and scripts/ingest-image.ts using the same pipeline. Each may need publisher-specific extraction examples in the prompt — ask me for a sample solicit URL for each and I'll provide it.

Run each the same way, and repeat the 3.4 trust check with 5–10 items per publisher.

**✅ Phase 1 of the PRD is now complete.** You have a data spine: three publishers, real FOC dates, validated ingestion.

---

## Part 4 — The app: browse + pull list (~1–2 sessions)

### 4.1 Catalog UI
Paste into Claude Code:

> Build the reader-facing catalog per the PRD sections 5.1 and 5.2:
> - Default route "/" = "This Week's FOC": all items with foc_date in the next 7 days, grouped by foc_date, then publisher. Show cover thumbnail placeholder, series + issue, price, street date, and a prominent FOC countdown (e.g. "FOC in 3 days").
> - Collapse variants: show the A cover with a "+4 variants" expander.
> - Filters: publisher multi-select, format, and a search box over series/title/creators (use Postgres ilike or pg_trgm).
> - Secondary view "/week/[date]" = releases by street date week.
> - Item detail page: full solicit text, creators, dates, variant list.
> - Pull list: an "Add" button on every item. Pull list page at "/pull-list" grouped by FOC date with quantity steppers and remove. Persist to Supabase (single hardcoded user for now — I'll add auth later).
> Use the frontend patterns from a dark, clean, data-dense aesthetic. Mobile-friendly — I'll use this on my phone in the shop.

Then run `npm run dev` in the terminal and open **http://localhost:3000** in your browser. Click around. Anything that feels wrong, describe it plainly to Claude Code ("the FOC groups should be sorted soonest-first"; "search doesn't find 'Absolute Batman' when I type 'absolute bat'").

### 4.2 The money feature: printable pull list
Paste into Claude Code:

> Build the print/export feature per PRD section 5.3:
> 1. "/pull-list/print" — a black-and-white print-optimized layout (print CSS, no dark background). Header: customer name, shop name, generated date. Grouped by FOC date, then publisher. Columns: item code (blank if unknown), series/title, issue, variant, price, street date, qty. Compact — target 25–30 rows per page.
> 2. A "Download CSV" button exporting the same rows.
> 3. A "Download PDF" button (server-rendered from the print layout).
> Add a Print button on the pull list page that opens the print view and triggers the browser print dialog.

**Test it for real:** add ~15 items to your pull list, print the page (Cmd+P), and look at the paper like a shop owner would. This printout is the product — iterate until you'd be comfortable handing it across the counter.

**✅ Part 4 gate = PRD Phase 2 "usable by Nick" milestone.** Take the printout to your LCS this week and ask them two questions: "could you order from this?" and "what's missing?" That's your best product research for free.

---

## Part 5 — Deploy + automate (~1 session)

### 5.1 Deploy to Vercel
1. In Claude Code: *"Commit and push everything to GitHub."*
2. Go to **https://vercel.com/dashboard** → **Add New → Project** → import `comic-avails` from GitHub.
3. Before clicking Deploy, expand **Environment Variables** and add the same four variables from your `.env.local` file (copy-paste name and value for each).
4. Click **Deploy**. In ~2 minutes you get a live URL like `comic-avails.vercel.app`. Open it on your phone and confirm it works.

### 5.2 Automate the weekly refresh
Paste into Claude Code:

> Set up scheduled ingestion:
> 1. Convert the ingest scripts into API routes callable by Vercel Cron, protected by a CRON_SECRET env var.
> 2. Schedule: solicit ingestion runs weekly (solicit sources update on publisher cycles; weekly catch-all is fine for MVP). Add a status flip job that marks items foc_passed when foc_date is in the past.
> 3. Log every run to ingest_runs. Build a simple /admin page (protected by a simple password env var for now) showing the last 20 runs, counts, and rejects so I can spot a broken parser at a glance.
> 4. Tell me exactly what to add in the Vercel dashboard, step by step, including the CRON_SECRET env var.

Follow the dashboard steps it gives you. Then check `/admin` every Monday for the first month — a parser will eventually break silently when a source site redesigns, and the admin page is how you catch it in one glance instead of noticing missing books at FOC.

**✅ Part 5 gate:** Live URL, cron visible under Vercel → Project → Settings → Cron Jobs, and an /admin page showing green runs.

---

## Part 6 — Expand coverage (PRD Phase 3, ongoing)

One publisher at a time, in pull-list-impact order: **Boom! → Dark Horse → Titan → Dynamite → Oni → IDW → Mad Cave.** For each, the loop is the same and takes under an hour once the pipeline is proven:

1. Find that publisher's latest monthly solicit URL.
2. Claude Code: *"Add an ingest script for [publisher] using ingest-core, here's a sample URL: ..."*
3. Run it, hand-check 5 items, fix classification quirks.
4. Add it to the cron rotation.

Two publisher-specific notes from the PRD research:
- **Dynamite** ships via both Lunar and Universal — if you ever add distributor-sourced data, dedupe on item code so books don't appear twice.
- **Oni** switches to PRH on **August 1, 2026** — the seed data already encodes this; nothing to do, but don't be surprised when their solicit formatting changes around then.

---

## Part 7 — Later (park these until the core is boring and reliable)

- **FOC email digest** ("5 items on your list hit FOC Sunday") — Resend is the easy add on Vercel.
- **Series subscriptions** (auto-add every issue of a series).
- **Share link** for your LCS (read-only pull list URL).
- **Auth** (Supabase Auth) if anyone besides you will use it.
- **Metron enrichment** for covers/creator normalization — cache hard; their rate limits tightened in 2026.
- **Retailer mode** — the V2 with actual market potential; revisit after your LCS reacts to the printout.

---

## When things go wrong: the universal debug loop

1. Copy the **entire** error message (terminal red text, or browser console via right-click → Inspect → Console).
2. Paste it to Claude Code with: *"This happened when I [what you did]. Diagnose and fix."*
3. Re-run the thing that failed.
4. If you're going in circles after 3 rounds, say: *"Stop and re-read the relevant files from scratch, list three possible root causes, and check each one before changing more code."* This breaks loop behavior reliably.

And the standing rule from your other builds applies here too: **one working thing before the next thing.** DC before Marvel. Print view before email digests. The gates in this guide are the checkpoints — don't move past a ❌.
