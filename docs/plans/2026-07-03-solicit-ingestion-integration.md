# Plan: Multi-Publisher Solicitation Ingestion & Ongoing Refresh

**Date:** 2026-07-03
**Author:** Claude Code (with Nick)
**Companion to:** `comic-avails-prd.md` (§4, §6, §7), `comic-avails-build-guide.md` (Parts 3, 5, 6)
**Status:** Draft for review

---

## 1. Objective

Move from one hand-run DC ingest script to **all 10 MVP publishers**, and make
the pipeline **self-refreshing** so new monthly solicits flow in automatically
instead of Nick hunting URLs each month.

Two artifacts already exist from this session:
- `scripts/ingest-dc.ts` — the validated single-publisher pipeline (DC).
- `scripts/lib/sources.ts` — the **source registry**: per-publisher URL slug,
  current known-good solicit URL, distributor, and coverage notes.

This plan turns those into a repeatable, scheduled system.

---

## 2. The "current URLs" answer (as of 2026-07-03)

Latest posted window is **September 2026** (comicreleases.com posts ~3 months
ahead, under a `/YYYY/MM/` path). Confirmed current URLs live in
`scripts/lib/sources.ts`. Summary:

| Publisher | Current solicit URL (comicreleases.com) | Status |
|---|---|---|
| DC | `/2026/06/dc-september-2026-solicitations/` | ✅ verified |
| Marvel | `/2026/06/marvel-september-2026-solicitations/` | ✅ verified |
| Image | `/2026/06/image-september-2026-solicitations/` | ✅ verified |
| Boom! | `/2026/06/boom-september-2026-solicitations/` | ✅ verified |
| Dark Horse | `/2026/06/dark-horse-september-2026-solicitations/` | ✅ verified |
| Dynamite | `/2026/06/dynamite-september-2026-solicitations/` | ✅ verified |
| IDW | `/2026/06/idw-september-2026-solicitations/` | ✅ verified |
| Mad Cave | `/2026/06/mad-cave-september-2026-solicitations/` | ✅ verified |
| Titan | `/2026/05/titan-august-2026-solicitations/` (August) | ⚠️ Sept unverified |
| Oni Press | `/2026/04/oni-press-july-2026-solicitations/` (July) | ⚠️ coverage gap |

**Discovery anchor:** the stable monthly index
`comicreleases.com/category/solicitations/2026/2026-09/` lists every publisher's
post for a month — the key to not hardcoding URLs going forward.

---

## 3. Architecture

### 3.1 Refactor to a shared core (build guide §3.5)
Extract the reusable pipeline from `ingest-dc.ts` into
`scripts/lib/ingest-core.ts`:

- `fetchArticleText(url)` — fetch + cheerio strip
- `chunkText`, `extractChunk` (Claude structured output), `dedupeItems`
- `validate` (dates parse, foc<street, price range for single issues, non-empty series)
- `Ingestor` (series/creator upsert, item upsert, `ingest_runs` bookkeeping)

Per-publisher scripts (`ingest-marvel.ts`, etc.) become thin: look up the source
in the registry, optionally add publisher-specific extraction few-shot examples,
call the core. Better still — **one generic `ingest.ts <slug>`** driven entirely
by the registry, with per-publisher prompt overrides as data. Recommend the
generic runner; it's less code to keep in sync across 10 publishers.

### 3.2 The registry is the source of truth
`scripts/lib/sources.ts` already encodes slug, urlSlug, distributor, current URL,
fallbacks, and notes. Everything (manual runs, cron, discovery) reads from it.

### 3.3 Going-forward discovery (the "and going forward" ask)
A `discover.ts` step that keeps `current` URLs fresh **without** manual hunting:

1. Compute the target solicit month (e.g. "newest available" or "current + 1").
2. Fetch the monthly index `monthlyIndexUrl(year, month)` from the registry.
3. Parse the listed post links; match each to a publisher by `urlSlug`.
4. Update each source's `current.url` (or emit them to the cron runner directly).

Index-scraping beats URL-construction because slugs drift (Mad Cave sometimes
omits the month; Dark Horse occasionally singular "solicitation"). Construction
is the fallback when a publisher is missing from the index.

---

## 4. Automation (build guide Part 5)

- Convert the ingest core into a **Vercel Cron** API route, protected by
  `CRON_SECRET`.
- **Weekly** run (solicit sources update on publisher cycles; weekly catch-all is
  fine for MVP): `discover` → ingest each registry publisher → log to
  `ingest_runs`.
- A **status-flip** job marks items `foc_passed` once `foc_date` is in the past.
- `/admin` page (simple password env for now): last 20 runs, counts, rejects —
  the one-glance "is a parser broken?" check. Parsers break silently when a
  source site redesigns; this is how we catch it.

---

## 5. Risks & coverage gaps (the real findings)

| Risk | Evidence | Mitigation |
|---|---|---|
| **Bot protection (403)** | WebFetch got HTTP 403 from comicreleases.com (Cloudflare). Google/WebSearch works; direct fetch may not. | On the first real run, confirm `ingest-dc.ts`'s `fetch` (browser-like UA) isn't 403'd. If it is: rotate a realistic UA, add ret/backoff, or fall back to a headless-browser fetch / an alternate aggregator. **This gates the whole pipeline — verify before scaling to 10 publishers.** |
| **Oni Press coverage gap** | Oni's Aug/Sept solicits absent from comicreleases after its **2026-08-01 Lunar→PRH switch**; they appear on Bleeding Cool / Comics Beat instead. | Add a fallback source for Oni (registry already lists them). Longer term, evaluate the PRH catalog / Title API (PRD §4.2) as Oni's real home post-PRH. Expect a solicit-format change around the switch. |
| **Titan Sept unconfirmed** | Only Titan's August URL surfaced on comicreleases via search. | Let discovery resolve it from the Sept index; if truly absent, use the `comicsolicitations.com` fallback in the registry. |
| **Dynamite double-listing** | Dual-distributed (Lunar + Universal). | Aggregator solicits list each book once, so MVP is fine. If distributor-sourced data is added later, dedupe on publisher item code (PRD §4.3). |
| **Slug drift** | Mad Cave drops the month; Dark Horse occasionally singular. | Discovery-by-index (not URL construction) absorbs this. |
| **Silent parser rot** | Any source redesign breaks extraction quietly. | `/admin` run monitor + rejects list; alert if extracted count drops sharply vs. last run. |

---

## 6. Phased rollout

**Phase A — Prove the pipeline end-to-end (blocks everything).**
1. Fix `.env.local` keys (`SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` — see handoff).
2. Apply the schema migration to Supabase.
3. Run `ingest-dc.ts` against the Sept DC URL; **verify no 403**; do the §3.4
   trust check (10 hand-checked items).

**Phase B — Generalize.**
4. Refactor to `scripts/lib/ingest-core.ts` + generic `ingest.ts <slug>`.
5. Ingest Marvel & Image (build guide §3.5); trust-check 5–10 items each.

**Phase C — Full coverage** (impact order: Boom → Dark Horse → Titan → Dynamite
→ Oni → IDW → Mad Cave). Trust-check each; handle Oni's fallback source.

**Phase D — Automate.**
6. `discover.ts` (index scrape) to refresh `current` URLs.
7. Vercel cron + `CRON_SECRET` + status-flip job + `/admin` monitor.

Standing rule (build guide): **one working thing before the next.** DC verified
before Marvel; ingestion trustworthy before automation.

---

## 7. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| P1 | **Generic `ingest.ts <slug>`** vs. per-publisher scripts | Generic runner + registry — less duplication across 10 publishers. |
| P2 | **Primary source**: comicreleases-only vs. multi-source with fallbacks | comicreleases primary for MVP; wire Oni's fallback now since it's already broken. |
| P3 | **Oni post-PRH** long-term source | Spike the PRH catalog / Title API (PRD §4.2, Open Q #5) — Oni is the canary for the whole PRH set. |
| P4 | **Discovery cadence** | Weekly cron matches the build guide; monthly solicits + weekly date reconciliation later (PRD §4.3). |
| P5 | **Target month logic** | Ingest "all currently-posted future months" (not just the newest) so nothing is missed between runs. |

---

## 8. References
- Registry: `scripts/lib/sources.ts`
- Validated pipeline: `scripts/ingest-dc.ts`
- Handoff / blockers: `docs/HANDOFF-2026-07-03.md`
- PRD sources research: `comic-avails-prd.md` §4.2–4.3
