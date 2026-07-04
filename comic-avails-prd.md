# PRD: Comic Avails Tracker & Pull List Builder
**Working title:** Pull List (TBD)
**Author:** Nick Tangborn
**Status:** Draft v0.1 — for review
**Date:** July 1, 2026

---

## 1. Problem Statement

Since Diamond Comic Distributors' collapse (Chapter 11 in January 2025, Chapter 7 liquidation and full shutdown December 31, 2025), there is **no single unified catalog of upcoming comic book releases**. The Previews catalog — the industry's ordering bible for 30 years — is gone. Distribution has fragmented across three major distributors (Lunar, Penguin Random House, Universal) plus smaller players (Philbo), each with its own portal, catalog format, order-by (FOC) cadence, and street-date conventions (DC ships Tuesdays; most others Wednesdays).

For a reader who wants to maintain a pull list at a local comic shop (LCS), there is no clean way to:
1. See **all upcoming releases across publishers** in one place, with street dates and FOC (order-by) dates
2. Filter and browse by publisher, series, creator, or format
3. Generate a **clean, printable pull list** to hand to (or email to) an LCS in time for the shop to order before FOC

FOC dates matter more than street dates for this use case: once FOC passes (generally 3–4 weeks before release), print runs are set and the shop may not be able to get the book. A pull list app that surfaces FOC deadlines — not just release dates — is genuinely differentiated.

## 2. Goals & Non-Goals

### Goals (MVP)
- Aggregate upcoming comic avails (single issues + collected editions) for major publishers: **Marvel, DC, Image, Dark Horse, Boom! Studios, IDW, Titan, Dynamite, Oni Press, Mad Cave**, with room for others
- Store full metadata: title, issue #, publisher, distributor, street date, FOC date, cover price, creators (writer/artist/cover), variant covers, format, diamond-style item code / SKU, cover image, solicitation text
- Browse/filter UI: by publisher, by week (street date), by FOC deadline, by series, by creator
- Pull list builder: add items to a personal pull list, with quantity per item (variants)
- **Printable/exportable pull list** (print CSS + PDF export + CSV) organized by FOC date or street date, formatted so an LCS can act on it directly (item codes included)
- Weekly data refresh, automated

### Non-Goals (MVP)
- No commerce/checkout — this is a discovery + list tool, not a store
- No collection tracking / "what I own" cataloging (LoCG does this well already)
- No pricing/valuation data
- No retailer-side features (order aggregation across customers) — *possible V2, see §9*
- No manga/book-channel coverage in MVP (Viz and Yen Press currently have no direct-market distributor; their cadence is bookstore-style)

## 3. Users

- **Primary:** The engaged pull-list reader (Nick as user zero). Reads 10–40 titles/month across publishers, has a relationship with an LCS, wants to pre-order reliably in the post-Diamond chaos.
- **Secondary (V2):** LCS retailers — small shops lost Diamond's Previews catalog and consolidated ordering tools; several now juggle 3+ portals. A consumer tool that produces clean, item-coded pull lists reduces their friction too.

## 4. Data Source Research (the core finding)

### 4.1 Landscape summary — who distributes whom (July 2026)

| Publisher | Direct-Market Distributor | Notes |
|---|---|---|
| DC | Lunar (primary); Universal (secondary) | Tuesday street dates |
| Image | Lunar | Left Diamond entirely in early 2025 |
| Marvel | Penguin Random House (PRHPS) | Exclusive since Oct 2021 |
| Dark Horse | PRH | |
| IDW | PRH | |
| Boom! Studios | PRH | Now a PRH subsidiary outright |
| Oni Press | Lunar until Jul 31, 2026 → **PRH exclusive from Aug 1, 2026** | Includes Magnetic Press imprint; also via Universal |
| Titan | Lunar | Former Diamond exclusive; moved after collapse |
| Dynamite | Lunar + Universal (US, since Jan 2026 releases) | Dual-distributor — dedupe required |
| Mad Cave | Lunar | |
| Small press (Zenescope, Devil's Due, etc.) | Philbo, Universal, direct | Long tail; V2 |

**Design implication:** The publisher→distributor mapping is volatile (Oni switches mid-build!). It must be **data, not code** — a `publisher_distributor` table with effective dates, not hardcoded logic.

### 4.2 Candidate data sources, evaluated

| Source | What it offers | Access | Upcoming data? | FOC dates? | Verdict |
|---|---|---|---|---|---|
| **Lunar Distribution** (lunardistribution.com) | Full solicitations for DC/Image/Titan/Dynamite/Mad Cave etc. CSV downloads of product data, in-store dates, FOC filter | Retailer account required for ordering; public site lists products | ✅ Months ahead | ✅ Native | **Primary source A.** Explore public catalog pages first; retailer account is the clean path (see Open Questions) |
| **PRH Comics** (prhcomics.com) | Marvel/Dark Horse/IDW/Boom (soon Oni) catalogs, FOC title lists, sell sheets | Retailer self-service login for ordering; catalog/FOC lists browsable | ✅ | ✅ | **Primary source B.** PRH also operates a public **Title API** (developer.penguinrandomhouse.com) for book-trade metadata — verify comics periodical coverage |
| **Universal Distribution** | DC (secondary), Dynamite US | Retailer portal | ✅ | ✅ | Redundant with Lunar/PRH for our publisher set; skip in MVP |
| **Metron** (metron.cloud) | Open community comic DB; REST API; publishers, series, issues, creators, arcs; Python wrapper (Mokkari) | Free API key; **rate limits recently reduced** (~throttled req/day) | Partial | ❌ | **Enrichment source.** Great for canonical series/creator IDs and covers. Cache aggressively; respect 429/Retry-After |
| **ComicVine API** | Deep historical DB | Free key, rate-limited | ❌ Store dates populate release-day or later, often blank | ❌ | Not viable for avails. Optional deep-metadata enrichment only |
| **League of Comic Geeks** | Best consumer new-release + upcoming DB; pull list features; retailer program | **No official public API** | ✅ | Partial | Benchmark/UX reference, not a data source. Don't scrape — ToS risk |
| **ComicList.com** | Long-running weekly release lists (text/CSV-ish) | Public, scrape-friendly format | Release week + a few weeks out | ❌ | **Fallback/validation source** for street-date reconciliation |
| **Publisher monthly solicitations** (via Comic Releases, CBR, Bleeding Cool, publisher press rooms) | Full solicit text, covers, prices, FOC dates ~2–3 months ahead | Public HTML; structured-ish per site | ✅ | ✅ Often listed | **Primary source C (scrape/parse).** Comicreleases.com posts per-publisher monthly solicits incl. FOC. LLM-assisted parsing makes this tractable |
| **PreviewsWorld / Diamond** | — | Dead | — | — | Gone. Do not build on |

### 4.3 Recommended ingestion strategy

**Three-layer pipeline:**

1. **Solicitation ingest (monthly):** Parse publisher monthly solicitations (per-publisher scrapers for solicit aggregator pages and/or publisher press pages). This yields the 2–3-month-forward window: title, issue, creators, price, solicit text, covers/variants, FOC date, street date. Use Claude (Anthropic API) as the parsing layer — solicit formats are semi-structured and vary by publisher; an LLM extraction step into a strict JSON schema is far more robust than regex, and this is squarely your stack.
2. **Distributor reconciliation (weekly):** Lunar and PRH catalog/FOC lists are the ground truth for *dates* (street dates slip constantly; FOC moves). Weekly job reconciles dates and flags changes ("FOC moved up," "release delayed").
3. **Metadata enrichment (async):** Metron API for canonical series IDs, creator normalization, cover images where solicits lack them. Heavily cached, rate-limit-aware queue.

**Dedup keys:** distributor item code where available; else normalized (publisher, series, issue, variant-letter) tuple. Dynamite appears via two distributors — dedupe on publisher item code.

## 5. Product Requirements

### 5.1 Catalog Browse
- Default view: **"This Week's FOC"** — items whose order-by deadline is in the next 7 days (the actionable view)
- Secondary views: by street date (weekly calendar), by publisher, by series
- Filters: publisher (multi-select), format (single issue / TP / HC / omnibus), variant covers (show/hide — hide by default, showing A-covers only with a "+ n variants" expander), price range, creator search
- Item detail: cover, full solicit text, creators, price, street date, FOC date + countdown, variant gallery, item codes per distributor
- Search: title/series/creator, typo-tolerant (Postgres `pg_trgm` is enough at this scale)

### 5.2 Pull List
- One-tap add from any catalog view; quantity + specific cover/variant selection
- Pull list states per item: *Want* → *Submitted to shop* → *Received* (lightweight, manual)
- Recurring series subscription: "pull every issue of *Absolute Batman*" auto-adds new solicits
- **FOC alert:** email (and/or in-app) digest — "5 items on your list hit FOC this Sunday"

### 5.3 Print / Export (the money feature)
- **Print view:** clean B&W-friendly layout grouped by FOC date, then publisher. Columns: item code, title, issue, variant, price, street date, qty. Header block with customer name + shop name + date. One page ≈ 25–30 line items.
- **PDF export** (same layout, server-rendered)
- **CSV export** matching Lunar's upload format where possible (Lunar accepts CSV order uploads — if your shop orders from Lunar, your list could be literally upload-ready for them)
- **Share link:** read-only URL the LCS can open (no account needed)

### 5.4 Data freshness & trust signals
- Every item shows "last verified" timestamp and source
- Changed-date badges: FOC moved / release delayed / cancelled / resolicited (RES) / offered again (O/A)

## 6. Technical Architecture

**Stack:** Next.js (App Router) + Supabase (Postgres, Auth, Storage for cover images) + Vercel (cron for ingestion jobs) + Anthropic API (solicit parsing). Matches the existing Ghost Guide / LotMonster stack — reuse patterns from the LotMonster ingestion + hardened read-only DB role work.

### 6.1 Core schema (draft)
```
publishers          (id, name, slug)
distributors        (id, name)
publisher_distributor (publisher_id, distributor_id, role, effective_from, effective_to)
series              (id, publisher_id, name, metron_id, start_year)
items               (id, series_id, publisher_id, title_raw, issue_number,
                     format, variant_code, cover_artist, price_cents,
                     street_date, foc_date, solicit_text, cover_url,
                     item_code_lunar, item_code_prh, status
                     [solicited|foc_passed|shipped|delayed|cancelled|resolicited],
                     source, last_verified_at)
item_creators       (item_id, creator_id, role)
creators            (id, name, metron_id)
pull_lists          (id, user_id, shop_name, customer_name)
pull_list_items     (pull_list_id, item_id, qty, state, added_at)
subscriptions       (user_id, series_id, variant_pref)
ingest_runs         (id, source, started_at, status, items_upserted, log)
```

### 6.2 Ingestion jobs (Vercel cron or Supabase edge functions)
- `ingest:solicits:{publisher}` — monthly, on known solicit-drop cadence (mid-month for month+2)
- `ingest:dates:lunar`, `ingest:dates:prh` — weekly (Thursday, after FOC processing)
- `enrich:metron` — continuous low-rate queue worker
- All jobs idempotent upserts keyed on dedup key; diffs generate change events → alert digests

### 6.3 Parsing layer
- Fetch solicit HTML → Claude extraction with strict JSON schema (per-publisher few-shot examples) → validation (dates sane, price sane, publisher matches) → upsert. Reject-and-flag rows that fail validation rather than silently ingesting garbage.

## 7. MVP Scope & Phasing

**Phase 1 — Data spine (2–3 weeks of build)**
Schema + ingestion for DC, Marvel, Image (3 publishers, 2 solicit formats, ~60% of a typical pull list). Manual-trigger ingest, admin table view to verify data quality.

**Phase 2 — Reader app**
Browse/filter UI, FOC-week default view, pull list CRUD, print view + CSV export. *This is the "usable by Nick" milestone.*

**Phase 3 — Coverage + automation**
Add Boom, Dark Horse, IDW, Titan, Dynamite, Oni, Mad Cave. Cron automation, change detection, FOC email digests, subscriptions.

**Phase 4 — Polish/V2 candidates**
Share links, Metron enrichment depth, variant galleries, retailer mode (see §9).

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Distributor landscape keeps shifting (Oni moves Aug 1; Dynamite dual-distributed; bankruptcy litigation ongoing) | High | Publisher→distributor mapping as dated data; source field on every item |
| Solicit scraping breaks when source sites change markup | Medium | LLM parsing is layout-tolerant; multiple redundant solicit sources; validation gates + ingest alerting |
| Lunar/PRH retailer data requires accounts (retailer-only) | Medium | MVP runs on public solicit data; distributor reconciliation is additive, not blocking. Investigate LoCG retailer program & PRH Title API as legitimate structured channels |
| Metron rate limits (recently reduced) | Low | Cache-first, queue with backoff, honor Retry-After; Metron is enrichment-only |
| ToS/copyright on solicit text & covers | Medium | Solicits are promotional material publishers *want* circulated; still — store source attribution, respond to takedowns, keep the app personal-use/free initially |
| Street/FOC dates change constantly | Certain | Change-detection + "last verified" is a *feature*, not just hygiene |

## 9. Future Opportunities (V2+)
- **Retailer mode:** shops lost Previews and consolidated ordering tools in the collapse. Aggregate customer pull lists into per-distributor order sheets (Lunar CSV upload format). This is a real pain point with a real market — the same fragmentation that motivates the consumer app hits shops 100x harder.
- LoCG retailer-program integration or import/export interop
- Small-press coverage via Philbo/Universal catalogs
- Weekly "what to order" editorial layer (natural crossover with the Ghosts in the Machine voice for horror titles)

## 10. Open Questions (for review)
1. **Retailer account access:** Do we (or a friendly LCS) register a Lunar retailer account for clean CSV solicitation data? Requires resale certificate — note Rosemary Pepper's TX resale cert experience; but a friendly-LCS partnership may be cleaner and doubles as user research.
2. **Variant policy:** Default-collapse variants to A-cover with expander — right call? Incentive variants (1:25 etc.) matter to some pull-list readers.
3. **Single-user first?** Build auth'd multi-user from day one (Supabase auth is nearly free to add) or run personal-tool-first like early Ghost Guide?
4. **Name/domain:** worth checking now if this might grow into a public product.
5. **PRH Title API:** need a spike to confirm whether periodical comics (not just book-trade GNs) are exposed with usable on-sale dates.
