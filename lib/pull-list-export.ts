import "server-only";
import type { PullListLine } from "@/lib/types";
import { getOrCreatePullListId } from "@/lib/pull-list";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Shared row-building for the pull-list print view, CSV export and PDF export —
 * one source of truth so all three stay in lockstep (PRD §5.3 / build guide 4.2).
 *
 * Grouping note: the PRD describes grouping by FOC date. Our solicit sources
 * publish an on-sale (street) date for every item but a FOC date for only some
 * (Marvel's header format), so grouping by FOC would dump ~70% of a list into a
 * single "No FOC date" bucket. Following the same street-date pivot already made
 * for the landing page (decision D4), the printout groups by STREET date and
 * keeps FOC as its own column so the deadline still shows where known.
 */

const FORMAT_LABELS: Record<string, string> = {
  single_issue: "Single",
  trade_paperback: "TP",
  hardcover: "HC",
  omnibus: "Omnibus",
  other: "Other",
};

export interface ExportRow {
  itemCode: string; // Lunar code, else PRH code, else "" (blank if unknown)
  publisher: string;
  series: string;
  issue: string;
  variant: string;
  title: string; // full raw title
  format: string; // short label
  priceCents: number | null;
  streetDate: string | null; // YYYY-MM-DD
  focDate: string | null; // YYYY-MM-DD
  qty: number;
}

export interface PrintPublisherGroup {
  publisher: string;
  rows: ExportRow[];
}

export interface PrintDateGroup {
  /** Street (on-sale) date for the group, or null when the item has none. */
  streetDate: string | null;
  publishers: PrintPublisherGroup[];
}

export interface PullListMeta {
  shopName: string | null;
  customerName: string | null;
}

function toRow(line: PullListLine): ExportRow {
  const it = line.item;
  return {
    itemCode: it.item_code_lunar ?? it.item_code_prh ?? "",
    publisher: it.publisher?.name ?? "",
    series: it.series?.name ?? it.title_raw,
    issue: it.issue_number ?? "",
    variant: it.variant_code ?? "",
    title: it.title_raw,
    format: it.format ? (FORMAT_LABELS[it.format] ?? it.format) : "",
    priceCents: it.price_cents ?? null,
    streetDate: it.street_date ?? null,
    focDate: it.foc_date ?? null,
    qty: line.qty,
  };
}

function naturalIssue(a: string, b: string): number {
  const fa = parseFloat(a);
  const fb = parseFloat(b);
  if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fa - fb;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Flat, print-ordered rows: by street date (nulls last), publisher, series, issue. */
export function buildExportRows(lines: PullListLine[]): ExportRow[] {
  return lines.map(toRow).sort((a, b) => {
    // Street date ascending, nulls last.
    const ad = a.streetDate ?? "";
    const bd = b.streetDate ?? "";
    if (ad !== bd) {
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    }
    if (a.publisher !== b.publisher) return a.publisher.localeCompare(b.publisher);
    if (a.series !== b.series) return a.series.localeCompare(b.series);
    return naturalIssue(a.issue, b.issue);
  });
}

/** Nest the flat rows into street-date → publisher groups for the print/PDF view. */
export function groupForPrint(rows: ExportRow[]): PrintDateGroup[] {
  const byDate = new Map<string, ExportRow[]>();
  for (const r of rows) {
    const key = r.streetDate ?? "";
    const arr = byDate.get(key);
    if (arr) arr.push(r);
    else byDate.set(key, [r]);
  }
  const dateKeys = [...byDate.keys()].sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  });
  return dateKeys.map((dk) => {
    const rows = byDate.get(dk)!;
    const byPub = new Map<string, ExportRow[]>();
    for (const r of rows) {
      const arr = byPub.get(r.publisher);
      if (arr) arr.push(r);
      else byPub.set(r.publisher, [r]);
    }
    const publishers = [...byPub.entries()]
      .map(([publisher, rows]) => ({ publisher, rows }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher));
    return { streetDate: dk === "" ? null : dk, publishers };
  });
}

/** Read the pull list's shop / customer name (for the print header). */
export async function getPullListMeta(): Promise<PullListMeta> {
  const listId = await getOrCreatePullListId();
  if (!listId) {
    return {
      shopName: process.env.PULL_LIST_SHOP_NAME ?? null,
      customerName: process.env.PULL_LIST_CUSTOMER_NAME ?? null,
    };
  }
  try {
    const db = serviceClient();
    const { data } = await db
      .from("pull_lists")
      .select("shop_name, customer_name")
      .eq("id", listId)
      .maybeSingle();
    return {
      shopName: data?.shop_name ?? process.env.PULL_LIST_SHOP_NAME ?? null,
      customerName:
        data?.customer_name ?? process.env.PULL_LIST_CUSTOMER_NAME ?? null,
    };
  } catch {
    return {
      shopName: process.env.PULL_LIST_SHOP_NAME ?? null,
      customerName: process.env.PULL_LIST_CUSTOMER_NAME ?? null,
    };
  }
}

/* ------------------------------- CSV --------------------------------------- */

const CSV_HEADERS = [
  "Item Code",
  "Qty",
  "Publisher",
  "Series",
  "Issue",
  "Variant",
  "Title",
  "Format",
  "Price",
  "Street Date",
  "FOC Date",
] as const;

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with item code + qty leading, so it's closer to an order-upload sheet. */
export function toCSV(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.itemCode,
        r.qty,
        r.publisher,
        r.series,
        r.issue,
        r.variant,
        r.title,
        r.format,
        r.priceCents == null ? "" : (r.priceCents / 100).toFixed(2),
        r.streetDate ?? "",
        r.focDate ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // CRLF line endings + leading BOM so Excel opens it cleanly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Filename stamp like pull-list-2026-07-08. Pass the date in (no Date.now in libs). */
export function exportFilename(ext: string, today: string): string {
  return `pull-list-${today}.${ext}`;
}
