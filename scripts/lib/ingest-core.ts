/**
 * scripts/lib/ingest-core.ts
 *
 * Publisher-agnostic solicitation ingest pipeline. Given a publisher slug and a
 * solicit-page URL, it:
 *   1. Fetches the solicit page HTML
 *   2. Strips it to the main article text
 *   3. Sends it to Claude to extract every solicited item as strict JSON
 *      (chunked + merged if the page is long)
 *   4. Validates every row; invalid rows go to a `rejects` list (never the DB)
 *   5. Upserts valid rows into Supabase (service-role key), creating/linking
 *      series and creators, and records a row in `ingest_runs`
 *   6. Returns a summary
 *
 * Validation policy (D4): solicit sources publish per-product ON-SALE dates but
 * not Final Order Cutoff dates. street_date is therefore the required anchor;
 * foc_date is optional (a null FOC is accepted, a malformed non-null value is
 * rejected).
 *
 * Required env (loaded from .env.local if present):
 *   ANTHROPIC_API_KEY
 *   SUPABASE_SECRET_KEY                (Supabase's new sb_secret_... service key)
 *   NEXT_PUBLIC_SUPABASE_URL           (or SUPABASE_URL)
 *
 * This writes to the catalog + ops tables, which have RLS enabled. It uses the
 * service-role/secret key, which bypasses RLS — do NOT run it with a
 * publishable/anon key or every insert will be denied.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const MODEL = "claude-sonnet-4-6";
// Single-pass for typical solicit pages (~85k chars ≈ 21k input tokens). Kept
// large on purpose: some publishers (Marvel and other PRH titles) give dates as
// SHARED SECTION HEADERS that apply to the titles beneath them, so a product and
// its date must stay in the same extraction call. Only very large pages chunk.
const CHUNK_CHARS = 100_000;

const VALID_FORMATS = [
  "single_issue",
  "trade_paperback",
  "hardcover",
  "omnibus",
  "other",
] as const;
type ItemFormat = (typeof VALID_FORMATS)[number];

export interface ExtractedItem {
  series_name: string;
  issue_number: string | null;
  title_raw: string;
  format: ItemFormat;
  variant_code: string | null;
  price_cents: number | null;
  street_date: string | null;
  foc_date: string | null;
  writers: string[];
  artists: string[];
  cover_artists: string[];
  solicit_text: string;
  /** Index into the page's ordered cover-image list ([IMG#N] markers), or null.
   *  Resolved to a URL (cover_url) in code after extraction. */
  cover_image_index: number | null;
  /** Populated in code from cover_image_index; not provided by the model. */
  cover_url?: string | null;
}

interface Reject {
  item: Partial<ExtractedItem>;
  reasons: string[];
}

export interface IngestOptions {
  /** Publisher slug — must match a publishers.slug row seeded by the migration. */
  slug: string;
  /** Publisher display name — used only to steer the extraction prompt. */
  publisher: string;
  /** The solicit-page URL to ingest. */
  url: string;
  /** Optional injected Anthropic/Supabase clients (tests); built from env if absent. */
  anthropic?: Anthropic;
  db?: SupabaseClient;
}

export interface IngestResult {
  url: string;
  extracted: number;
  upserted: number;
  rejected: number;
  rejects: Reject[];
}

// JSON Schema handed to the model via structured outputs. Wrapping the array in
// an `items` object keeps the top-level a JSON object (the safe shape for
// output_config.format). Nullable fields use ["type","null"] unions.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          series_name: { type: "string" },
          issue_number: { type: ["string", "null"] },
          title_raw: { type: "string" },
          format: { type: "string", enum: VALID_FORMATS },
          variant_code: { type: ["string", "null"] },
          price_cents: { type: ["integer", "null"] },
          street_date: { type: ["string", "null"] },
          foc_date: { type: ["string", "null"] },
          writers: { type: "array", items: { type: "string" } },
          artists: { type: "array", items: { type: "string" } },
          cover_artists: { type: "array", items: { type: "string" } },
          solicit_text: { type: "string" },
          cover_image_index: { type: ["integer", "null"] },
        },
        required: [
          "series_name",
          "issue_number",
          "title_raw",
          "format",
          "variant_code",
          "price_cents",
          "street_date",
          "foc_date",
          "writers",
          "artists",
          "cover_artists",
          "solicit_text",
          "cover_image_index",
        ],
      },
    },
  },
  required: ["items"],
} as const;

function extractionPrompt(publisher: string): string {
  return `You are a data-extraction engine for comic-book solicitations.

You will be given the text of a monthly ${publisher} solicitations page. Extract
EVERY solicited product into a JSON array. One object per product; treat each
distinct variant cover as its own object.

Field rules:
- series_name: the ongoing/mini series or collection title WITHOUT the issue
  number (e.g. "Amazing Spider-Man", "Detective Comics").
- issue_number: the issue number as a string exactly as printed ("1", "1050",
  "0", "1/2", "Annual 1"). Null for collected editions with no issue number.
- title_raw: the full raw product title as printed, including issue number and
  variant designation.
- format: one of single_issue | trade_paperback | hardcover | omnibus | other.
  Single issues are periodical comics; TPs/HCs/omnibuses are collected editions.
- variant_code: the variant-cover letter (A, B, C, ...) if the title designates
  one (e.g. "Cover B", "Variant B"). Use "A" for the standard/main cover only
  when the page explicitly labels covers; otherwise null.
- price_cents: US cover price in integer cents (e.g. $4.99 -> 499). Null if not
  stated.
- street_date: on-sale / in-store date as YYYY-MM-DD, or null if not stated.
- foc_date: Final Order Cutoff date as YYYY-MM-DD, or null if not stated.
- writers / artists / cover_artists: arrays of full creator names ([] if none).
- solicit_text: the descriptive solicitation paragraph ("" if none).
- cover_image_index: the page's cover images appear inline as markers "[IMG#N]"
  (N is a number) positioned next to the product they belong to. Set
  cover_image_index to the N of THIS product's cover image. For a variant-cover
  product, pick the [IMG#N] marker for that specific variant's art. Each marker
  belongs to at most one product — do not reuse the same N for multiple products.
  Use null if no image marker is clearly associated with this product.

IMPORTANT — shared date headers: some pages do NOT print a date next to each
product. Instead a HEADER LINE states the dates for every product listed beneath
it, until the next such header. Headers look like:
    "FOC 08/31/26, ON-SALE 10/14/26"
    "ON SALE 10/14/26"
    "FOC 08/03/26"
When you see one, apply its dates to EACH product that follows it (street_date
from the ON-SALE/ON SALE date, foc_date from the FOC date) until a new header
appears. Inline "(ON SALE 10/14/26)" annotations attach to that one product.
Dates are printed as M/D/YY or MM/DD/YY — interpret the 2-digit year as 20YY and
output YYYY-MM-DD.

Extract only real solicited products. Ignore navigation, ads, page headers/menus,
editorial commentary, and reader comments (but the dated section headers above
are NOT "headers" to ignore — use them for dates).

Return ONLY the JSON object matching the schema. No prose, no markdown, no
code fences.`;
}

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------
export function loadEnv(): void {
  // Node >= 20.12 / 24 ships process.loadEnvFile. Ignore if the file is absent
  // (env may already be exported into the process).
  try {
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(
      ".env.local",
    );
  } catch {
    /* .env.local not found — rely on the ambient environment */
  }
}

export function requireEnv(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(
    `Missing required environment variable: ${[name, ...fallbacks].join(" / ")}`,
  );
}

// ---------------------------------------------------------------------------
// 1 + 2. Fetch and strip to article text (+ collect ordered cover images)
// ---------------------------------------------------------------------------

/** Non-cover images to skip: site logo, CR-branded hero banners, spacers. */
const IMG_DENY = /(asset-\d|covercr|-1400x600\.|\/logo|spacer|placeholder|avatar|gravatar)/i;

/** Pick the real image URL from an <img>'s attrs, tolerating WP lazy-load. */
function pickImgUrl(cands: Array<string | undefined>): string | null {
  const u = (cands.find((c) => c && c.trim()) ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return null; // skip data: URIs / placeholders
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return null;
  if (IMG_DENY.test(u)) return null;
  return u;
}

interface FetchedArticle {
  text: string;
  /** Cover-image URLs in document order; index === the [IMG#N] marker in `text`. */
  images: string[];
}

async function fetchArticle(url: string): Promise<FetchedArticle> {
  const res = await fetch(url, {
    headers: { "user-agent": "comic-avails-ingest/1.0 (+solicit parser)" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Drop non-content elements. NOTE: keep <noscript> for now — this site's
  // lazy-load plugin hides the real cover <img> inside <noscript> fallbacks, so
  // the live DOM has almost no cover images. We mine those fallbacks below.
  $(
    "script, style, nav, header, footer, aside, form, iframe, .comments, #comments",
  ).remove();

  // Pick the main article container (strongest signal first, else the body).
  let sel = "body";
  for (const s of [".entry-content", "article", "main"]) {
    if ($(s).first().text().trim().length > 200) {
      sel = s;
      break;
    }
  }
  const container = $(sel).first();

  // Walk covers in document order — both real <img> and the <noscript> lazy
  // fallbacks — replacing each with an [IMG#N] marker so the model can associate
  // a product with its cover. Non-cover images are dropped.
  const images: string[] = [];
  container.find("noscript, img").each((_i, el) => {
    // domhandler element name: "noscript" carries its inner <img> as raw text.
    const name = (el as { name?: string }).name;
    let u: string | null = null;
    if (name === "noscript") {
      const inner = $(el).html() || $(el).text() || "";
      const m = inner.match(/<img[^>]*\bsrc=["']([^"']+)["']/i);
      u = pickImgUrl([m?.[1]]);
    } else {
      u = pickImgUrl([
        $(el).attr("data-lazy-src"),
        $(el).attr("data-src"),
        $(el).attr("src"),
      ]);
    }
    if (!u) {
      $(el).remove();
      return;
    }
    const n = images.length;
    images.push(u);
    $(el).replaceWith(` [IMG#${n}] `);
  });

  // Remove any leftover noscript (non-image fallbacks like tracking pixels).
  $("noscript").remove();

  const text = container
    .text()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*\n\s*/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, images };
}

/** Resolve a validated item's cover_image_index to a URL from the page images. */
function resolveCoverUrl(
  item: ExtractedItem,
  images: string[],
): string | null {
  const idx = item.cover_image_index;
  if (idx == null || !Number.isInteger(idx)) return null;
  return images[idx] ?? null;
}

// ---------------------------------------------------------------------------
// Chunking — split on blank-line boundaries so items aren't cut in half
// ---------------------------------------------------------------------------
function chunkText(text: string, maxChars = CHUNK_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current) {
      chunks.push(current);
      current = "";
    }
    // A single paragraph longer than the limit: hard-split it.
    if (para.length > maxChars) {
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
      continue;
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current) chunks.push(current);
  return chunks;
}

// ---------------------------------------------------------------------------
// 3. Extract via Claude (structured output), per chunk
// ---------------------------------------------------------------------------
async function extractChunk(
  client: Anthropic,
  publisher: string,
  chunk: string,
  chunkLabel: string,
): Promise<ExtractedItem[]> {
  const stream = client.messages.stream({
    model: MODEL,
    // 128K is claude-sonnet-4-6's output ceiling; large solicit pages (DC ~283
    // items) plus the cover_image_index field can exceed 64K. We already stream,
    // which is required at this max_tokens.
    max_tokens: 128_000,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: extractionPrompt(publisher),
    messages: [
      {
        role: "user",
        content: `Solicitation text (${chunkLabel}):\n\n${chunk}`,
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`Model refused to extract ${chunkLabel}`);
  }
  if (message.stop_reason === "max_tokens") {
    console.warn(
      `  ! ${chunkLabel}: hit max_tokens — extraction may be truncated`,
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse model JSON for ${chunkLabel}`);
  }
  const items = (parsed as { items?: unknown }).items;
  return Array.isArray(items) ? (items as ExtractedItem[]) : [];
}

function dedupeItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>();
  const out: ExtractedItem[] = [];
  for (const it of items) {
    const key = [
      (it.series_name ?? "").toLowerCase().trim(),
      (it.issue_number ?? "").toLowerCase().trim(),
      (it.variant_code ?? "").toLowerCase().trim(),
    ].join("||");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Validation
// ---------------------------------------------------------------------------
function parseISODate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject impossible dates that JS would roll over (e.g. 2026-02-30).
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

function validate(item: ExtractedItem): string[] {
  const reasons: string[] = [];

  if (!item.series_name || !item.series_name.trim()) {
    reasons.push("series_name is empty");
  }

  if (!VALID_FORMATS.includes(item.format)) {
    reasons.push(`invalid format: ${JSON.stringify(item.format)}`);
  }

  const foc = parseISODate(item.foc_date);
  const street = parseISODate(item.street_date);
  // street_date (on-sale) is the required anchor: solicit sources publish on-sale
  // dates, not per-product FOC dates. foc_date is optional (D4) — only reject a
  // non-null value that fails to parse; a genuine null is accepted.
  if (!street)
    reasons.push(`street_date does not parse: ${JSON.stringify(item.street_date)}`);
  if (item.foc_date != null && !foc)
    reasons.push(`foc_date present but does not parse: ${JSON.stringify(item.foc_date)}`);
  if (foc && street && foc.getTime() >= street.getTime()) {
    reasons.push(
      `foc_date (${item.foc_date}) is not before street_date (${item.street_date})`,
    );
  }

  // Price rule applies to single issues.
  if (item.format === "single_issue") {
    const p = item.price_cents;
    if (typeof p !== "number" || !Number.isInteger(p)) {
      reasons.push(`price_cents missing/non-integer for single issue: ${JSON.stringify(p)}`);
    } else if (p < 99 || p > 50_000) {
      reasons.push(`price_cents ${p} out of range [99, 50000] for single issue`);
    }
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// 5. Supabase upsert (create/link series + creators)
// ---------------------------------------------------------------------------
class Ingestor {
  private seriesCache = new Map<string, number>();
  private creatorCache = new Map<string, number>();

  constructor(
    private db: SupabaseClient,
    private publisherId: number,
    private sourceUrl: string,
  ) {}

  private async getOrCreateSeries(name: string): Promise<number> {
    const key = name.trim().toLowerCase();
    const cached = this.seriesCache.get(key);
    if (cached) return cached;

    const { data: existing, error: selErr } = await this.db
      .from("series")
      .select("id")
      .eq("publisher_id", this.publisherId)
      .eq("name", name.trim())
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(`series lookup failed: ${selErr.message}`);
    if (existing) {
      this.seriesCache.set(key, existing.id);
      return existing.id;
    }

    const { data: inserted, error: insErr } = await this.db
      .from("series")
      .insert({ publisher_id: this.publisherId, name: name.trim() })
      .select("id")
      .single();
    if (insErr) throw new Error(`series insert failed: ${insErr.message}`);
    this.seriesCache.set(key, inserted.id);
    return inserted.id;
  }

  private async getOrCreateCreator(name: string): Promise<number> {
    const key = name.trim().toLowerCase();
    const cached = this.creatorCache.get(key);
    if (cached) return cached;

    const { data: existing, error: selErr } = await this.db
      .from("creators")
      .select("id")
      .eq("name", name.trim())
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(`creator lookup failed: ${selErr.message}`);
    if (existing) {
      this.creatorCache.set(key, existing.id);
      return existing.id;
    }

    const { data: inserted, error: insErr } = await this.db
      .from("creators")
      .insert({ name: name.trim() })
      .select("id")
      .single();
    if (insErr) throw new Error(`creator insert failed: ${insErr.message}`);
    this.creatorCache.set(key, inserted.id);
    return inserted.id;
  }

  /** Upsert one validated item + its creator links. Returns the item id. */
  async upsertItem(item: ExtractedItem): Promise<number> {
    const seriesId = await this.getOrCreateSeries(item.series_name);

    const coverArtist =
      item.cover_artists && item.cover_artists.length
        ? item.cover_artists.join(", ")
        : null;

    const row: Record<string, unknown> = {
      series_id: seriesId,
      publisher_id: this.publisherId,
      title_raw: item.title_raw,
      issue_number: item.issue_number,
      format: item.format,
      variant_code: item.variant_code,
      cover_artist: coverArtist,
      price_cents: item.price_cents,
      street_date: item.street_date,
      foc_date: item.foc_date,
      solicit_text: item.solicit_text || null,
      status: "solicited" as const,
      source: this.sourceUrl,
      last_verified_at: new Date().toISOString(),
    };
    // Only write cover_url when we have one, so a later run that fails to match
    // a cover never clobbers a previously-captured URL with null (upsert only
    // updates the columns present in `row`).
    if (item.cover_url) row.cover_url = item.cover_url;

    const { data: upserted, error: upErr } = await this.db
      .from("items")
      .upsert(row, {
        onConflict: "publisher_id,series_id,issue_number,variant_code",
      })
      .select("id")
      .single();
    if (upErr) throw new Error(`item upsert failed: ${upErr.message}`);
    const itemId = upserted.id;

    // Link creators by role.
    const roleNames: Array<[string, string]> = [];
    for (const w of item.writers ?? []) roleNames.push([w, "writer"]);
    for (const a of item.artists ?? []) roleNames.push([a, "artist"]);
    for (const c of item.cover_artists ?? []) roleNames.push([c, "cover"]);

    const links: Array<{ item_id: number; creator_id: number; role: string }> =
      [];
    for (const [name, role] of roleNames) {
      if (!name || !name.trim()) continue;
      const creatorId = await this.getOrCreateCreator(name);
      links.push({ item_id: itemId, creator_id: creatorId, role });
    }
    if (links.length) {
      const { error: linkErr } = await this.db
        .from("item_creators")
        .upsert(links, {
          onConflict: "item_id,creator_id,role",
          ignoreDuplicates: true,
        });
      if (linkErr) throw new Error(`item_creators upsert failed: ${linkErr.message}`);
    }

    return itemId;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const { slug, publisher, url } = opts;
  const source = `ingest:solicits:${slug}`;

  const anthropic =
    opts.anthropic ??
    new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const db =
    opts.db ??
    createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
      requireEnv("SUPABASE_SECRET_KEY"),
      { auth: { persistSession: false } },
    );

  // Resolve the publisher (seeded by the migration).
  const { data: pub, error: pubErr } = await db
    .from("publishers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (pubErr) {
    throw new Error(
      `publisher lookup failed: ${pubErr.message} — is the migration applied and is SUPABASE_SECRET_KEY a service/secret key?`,
    );
  }
  if (!pub) {
    throw new Error(
      `Publisher '${slug}' not found. Apply the schema migration (which seeds publishers) before ingesting.`,
    );
  }

  // Open an ingest_runs record.
  const { data: run, error: runErr } = await db
    .from("ingest_runs")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  if (runErr) throw new Error(`could not open ingest_runs record: ${runErr.message}`);
  const runId = run.id;

  let extractedCount = 0;
  let upsertedCount = 0;
  const rejects: Reject[] = [];

  try {
    // 1 + 2. Fetch + strip (+ collect ordered cover images).
    console.log(`Fetching ${url} ...`);
    const { text: article, images } = await fetchArticle(url);
    console.log(
      `Article text: ${article.length.toLocaleString()} chars · ${images.length} cover image(s)`,
    );
    if (!article) throw new Error("No article text extracted from page");

    // 3. Extract (chunk + merge).
    const chunks = chunkText(article);
    console.log(
      `Extracting ${publisher} via ${MODEL} across ${chunks.length} chunk(s)...`,
    );
    const all: ExtractedItem[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const label = `chunk ${i + 1}/${chunks.length}`;
      const items = await extractChunk(anthropic, publisher, chunks[i], label);
      console.log(`  ${label}: ${items.length} item(s)`);
      all.push(...items);
    }
    const merged = dedupeItems(all);
    extractedCount = merged.length;
    console.log(`Extracted ${all.length} raw, ${extractedCount} after de-dup.`);

    // Resolve each item's cover image index -> URL.
    let coverCount = 0;
    for (const item of merged) {
      item.cover_url = resolveCoverUrl(item, images);
      if (item.cover_url) coverCount++;
    }
    console.log(`Covers matched: ${coverCount}/${extractedCount}`);

    // 4. Validate.
    const valid: ExtractedItem[] = [];
    for (const item of merged) {
      const reasons = validate(item);
      if (reasons.length) rejects.push({ item, reasons });
      else valid.push(item);
    }
    console.log(`Valid: ${valid.length}, Rejected: ${rejects.length}`);

    // 5. Upsert.
    const ingestor = new Ingestor(db, pub.id, url);
    for (const item of valid) {
      try {
        await ingestor.upsertItem(item);
        upsertedCount++;
      } catch (e) {
        rejects.push({ item, reasons: [`db error: ${(e as Error).message}`] });
      }
    }

    // Close the ingest_runs record.
    await db
      .from("ingest_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        items_upserted: upsertedCount,
        log: {
          url,
          extracted: extractedCount,
          upserted: upsertedCount,
          rejected: rejects.length,
        },
      })
      .eq("id", runId);
  } catch (e) {
    await db
      .from("ingest_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        items_upserted: upsertedCount,
        log: { url, error: (e as Error).message, upserted: upsertedCount },
      })
      .eq("id", runId);
    throw e;
  }

  return {
    url,
    extracted: extractedCount,
    upserted: upsertedCount,
    rejected: rejects.length,
    rejects,
  };
}

/** Pretty-print a run summary (shared by the CLI entry points). */
export function printSummary(publisher: string, result: IngestResult): void {
  console.log("\n=========== SUMMARY ===========");
  console.log(`Publisher: ${publisher}`);
  console.log(`Source:    ${result.url}`);
  console.log(`Extracted: ${result.extracted}`);
  console.log(`Upserted:  ${result.upserted}`);
  console.log(`Rejected:  ${result.rejected}`);
  if (result.rejects.length) {
    console.log("\n--- Rejected rows (NOT written to the database) ---");
    for (const r of result.rejects) {
      const id =
        r.item.title_raw ||
        `${r.item.series_name ?? "?"} #${r.item.issue_number ?? "?"}`;
      console.log(`  • ${id}`);
      for (const reason of r.reasons) console.log(`      - ${reason}`);
    }
  }
  console.log("===============================");
}
