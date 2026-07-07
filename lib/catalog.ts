import "server-only";
import { catalogClient } from "@/lib/supabase/server";
import type {
  CatalogItem,
  DateBucket,
  PublisherBucket,
  PublisherRef,
  VariantGroup,
} from "@/lib/types";
import { todayISO, addDaysISO } from "@/lib/format";

export const ITEM_SELECT = `
  id, series_id, publisher_id, title_raw, issue_number, format, variant_code,
  cover_artist, price_cents, street_date, foc_date, solicit_text, cover_url,
  item_code_lunar, item_code_prh, status,
  series:series_id ( id, name ),
  publisher:publisher_id ( id, name, slug ),
  item_creators ( role, creators ( name ) )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapItem(raw: any): CatalogItem {
  const credits = Array.isArray(raw.item_creators)
    ? raw.item_creators
        .map((ic: any) => ({
          role: ic.role as string,
          name: (ic.creators?.name as string) ?? "",
        }))
        .filter((c: { name: string }) => c.name)
    : [];
  return {
    id: raw.id,
    series_id: raw.series_id ?? null,
    publisher_id: raw.publisher_id,
    title_raw: raw.title_raw,
    issue_number: raw.issue_number ?? null,
    format: raw.format ?? null,
    variant_code: raw.variant_code ?? null,
    cover_artist: raw.cover_artist ?? null,
    price_cents: raw.price_cents ?? null,
    street_date: raw.street_date ?? null,
    foc_date: raw.foc_date ?? null,
    solicit_text: raw.solicit_text ?? null,
    cover_url: raw.cover_url ?? null,
    item_code_lunar: raw.item_code_lunar ?? null,
    item_code_prh: raw.item_code_prh ?? null,
    status: raw.status ?? "solicited",
    series: raw.series
      ? { id: raw.series.id, name: raw.series.name }
      : null,
    publisher: raw.publisher
      ? {
          id: raw.publisher.id,
          name: raw.publisher.name,
          slug: raw.publisher.slug,
        }
      : null,
    credits,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CatalogFilters {
  publisherSlugs?: string[];
  format?: string;
  q?: string;
}

export async function getPublishers(): Promise<PublisherRef[]> {
  try {
    const db = catalogClient();
    const { data, error } = await db
      .from("publishers")
      .select("id, name, slug")
      .order("name");
    if (error) throw error;
    return (data ?? []) as PublisherRef[];
  } catch (e) {
    console.error("getPublishers failed:", (e as Error).message);
    return [];
  }
}

function matchesQuery(item: CatalogItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [
    item.title_raw,
    item.series?.name ?? "",
    ...item.credits.map((c) => c.name),
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

async function fetchItemsInRange(
  field: "foc_date" | "street_date",
  startISO: string,
  endISO: string,
  filters: CatalogFilters,
): Promise<{ items: CatalogItem[]; error?: string }> {
  try {
    const db = catalogClient();

    // Resolve publisher slugs -> ids (only if filtering).
    let publisherIds: number[] | null = null;
    if (filters.publisherSlugs && filters.publisherSlugs.length) {
      const { data: pubs } = await db
        .from("publishers")
        .select("id, slug")
        .in("slug", filters.publisherSlugs);
      publisherIds = (pubs ?? []).map((p: { id: number }) => p.id);
      if (!publisherIds.length) return { items: [] };
    }

    let query = db
      .from("items")
      .select(ITEM_SELECT)
      .gte(field, startISO)
      .lte(field, endISO)
      .order(field, { ascending: true });

    if (publisherIds) query = query.in("publisher_id", publisherIds);
    if (filters.format) query = query.eq("format", filters.format);

    const { data, error } = await query;
    if (error) throw error;

    let items = (data ?? []).map(mapItem);
    if (filters.q) items = items.filter((it) => matchesQuery(it, filters.q!));
    return { items };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`fetchItemsInRange(${field}) failed:`, msg);
    return { items: [], error: msg };
  }
}

/* ---------- grouping: variants -> publisher -> date ---------- */

function naturalIssue(a: string | null, b: string | null): number {
  const na = a == null ? "" : a;
  const nb = b == null ? "" : b;
  const fa = parseFloat(na);
  const fb = parseFloat(nb);
  const aNum = !Number.isNaN(fa);
  const bNum = !Number.isNaN(fb);
  if (aNum && bNum && fa !== fb) return fa - fb;
  return na.localeCompare(nb, undefined, { numeric: true });
}

function isMainCover(item: CatalogItem): boolean {
  const v = (item.variant_code ?? "").trim().toUpperCase();
  return v === "" || v === "A";
}

function groupVariants(items: CatalogItem[]): VariantGroup[] {
  const groups = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const key = `${it.series_id ?? "x"}|${it.issue_number ?? ""}|${it.format ?? ""}`;
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  const result: VariantGroup[] = [];
  for (const [key, arr] of groups) {
    const sorted = [...arr].sort((a, b) => {
      // main covers first, then by variant_code
      const am = isMainCover(a) ? 0 : 1;
      const bm = isMainCover(b) ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.variant_code ?? "").localeCompare(b.variant_code ?? "");
    });
    result.push({ key, main: sorted[0], variants: sorted.slice(1) });
  }

  result.sort((g1, g2) => {
    const s1 = g1.main.series?.name ?? g1.main.title_raw;
    const s2 = g2.main.series?.name ?? g2.main.title_raw;
    const byName = s1.localeCompare(s2);
    if (byName !== 0) return byName;
    return naturalIssue(g1.main.issue_number, g2.main.issue_number);
  });
  return result;
}

function buildDateView(
  items: CatalogItem[],
  field: "foc_date" | "street_date",
): DateBucket[] {
  const byDate = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const d = it[field];
    if (!d) continue;
    const arr = byDate.get(d);
    if (arr) arr.push(it);
    else byDate.set(d, [it]);
  }

  const dates = [...byDate.keys()].sort();
  return dates.map((date) => {
    const dayItems = byDate.get(date)!;
    const byPub = new Map<number, CatalogItem[]>();
    for (const it of dayItems) {
      const arr = byPub.get(it.publisher_id);
      if (arr) arr.push(it);
      else byPub.set(it.publisher_id, [it]);
    }
    const publishers: PublisherBucket[] = [...byPub.values()]
      .map((pubItems) => ({
        publisher:
          pubItems[0].publisher ??
          ({ id: pubItems[0].publisher_id, name: "Unknown", slug: "unknown" } as PublisherRef),
        groups: groupVariants(pubItems),
      }))
      .sort((a, b) => a.publisher.name.localeCompare(b.publisher.name));
    return { date, publishers };
  });
}

function countGroups(buckets: DateBucket[]): number {
  let n = 0;
  for (const b of buckets) for (const p of b.publishers) n += p.groups.length;
  return n;
}

/** Default view: items whose FOC date is within the next 7 days.
 *  Retained for when a FOC-publishing source is added; the landing page uses
 *  getUpcomingReleases (street-date-forward) because current solicit sources
 *  publish on-sale dates, not FOC. */
export async function getFocThisWeek(
  filters: CatalogFilters,
  now: Date = new Date(),
): Promise<{ buckets: DateBucket[]; count: number; error?: string }> {
  const start = todayISO(now);
  const end = addDaysISO(start, 7);
  const { items, error } = await fetchItemsInRange(
    "foc_date",
    start,
    end,
    filters,
  );
  const buckets = buildDateView(items, "foc_date");
  return { buckets, count: countGroups(buckets), error };
}

/** Landing view: the soonest upcoming releases by on-sale (street) date.
 *  Solicit sources publish on-sale dates, not per-product FOC dates, so the
 *  landing page is street-date-forward. Returns the earliest `maxDates`
 *  distinct upcoming street-date days from today onward, plus the total count
 *  of upcoming titles so the page can say "…N more later". */
export async function getUpcomingReleases(
  filters: CatalogFilters,
  opts: { maxDates?: number } = {},
  now: Date = new Date(),
): Promise<{
  buckets: DateBucket[];
  count: number;
  total: number;
  hiddenDates: number;
  error?: string;
}> {
  const start = todayISO(now);
  const end = addDaysISO(start, 540); // wide horizon; capped by date count below
  const { items, error } = await fetchItemsInRange(
    "street_date",
    start,
    end,
    filters,
  );
  const all = buildDateView(items, "street_date");
  const maxDates = opts.maxDates ?? 6;
  const buckets = all.slice(0, maxDates);
  return {
    buckets,
    count: countGroups(buckets),
    total: countGroups(all),
    hiddenDates: Math.max(0, all.length - buckets.length),
    error,
  };
}

/** Secondary view: releases whose street date falls in the given Mon–Sun week. */
export async function getWeekReleases(
  weekStartISO: string,
  filters: CatalogFilters,
): Promise<{ buckets: DateBucket[]; count: number; error?: string }> {
  const end = addDaysISO(weekStartISO, 6);
  const { items, error } = await fetchItemsInRange(
    "street_date",
    weekStartISO,
    end,
    filters,
  );
  const buckets = buildDateView(items, "street_date");
  return { buckets, count: countGroups(buckets), error };
}

/** Item detail plus its sibling variant covers (same series + issue + format). */
export async function getItemDetail(
  id: number,
): Promise<{ item: CatalogItem | null; variants: CatalogItem[]; error?: string }> {
  try {
    const db = catalogClient();
    const { data, error } = await db
      .from("items")
      .select(ITEM_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { item: null, variants: [] };

    const item = mapItem(data);

    let variants: CatalogItem[] = [];
    if (item.series_id != null) {
      let sib = db
        .from("items")
        .select(ITEM_SELECT)
        .eq("series_id", item.series_id)
        .neq("id", item.id);
      sib = item.issue_number
        ? sib.eq("issue_number", item.issue_number)
        : sib.is("issue_number", null);
      sib = item.format ? sib.eq("format", item.format) : sib;
      const { data: sibs } = await sib;
      variants = (sibs ?? []).map(mapItem);
    }
    return { item, variants };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("getItemDetail failed:", msg);
    return { item: null, variants: [], error: msg };
  }
}
