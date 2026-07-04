import Link from "next/link";
import { getWeekReleases, getPublishers, type CatalogFilters } from "@/lib/catalog";
import { getPullListItemIds } from "@/lib/pull-list";
import { Filters } from "@/components/Filters";
import { DateSection } from "@/components/DateSection";
import { EmptyState } from "@/components/EmptyState";
import {
  mondayOfWeekISO,
  todayISO,
  addDaysISO,
  formatDateShort,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseFilters(sp: SP): CatalogFilters {
  const pub = first(sp.pub);
  return {
    publisherSlugs: pub ? pub.split(",").filter(Boolean) : undefined,
    format: first(sp.format) || undefined,
    q: first(sp.q) || undefined,
  };
}

function queryString(sp: SP): string {
  const p = new URLSearchParams();
  for (const key of ["pub", "format", "q"]) {
    const v = first(sp[key]);
    if (v) p.set(key, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function WeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<SP>;
}) {
  const { date } = await params;
  const sp = await searchParams;
  const filters = parseFilters(sp);

  // Normalize any date in the week to that week's Monday; fall back to current.
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const weekStart = mondayOfWeekISO(valid ? date : todayISO());
  const weekEnd = addDaysISO(weekStart, 6);
  const prev = addDaysISO(weekStart, -7);
  const next = addDaysISO(weekStart, 7);
  const qs = queryString(sp);

  const [publishers, releases, addedIds] = await Promise.all([
    getPublishers(),
    getWeekReleases(weekStart, filters),
    getPullListItemIds(),
  ]);

  return (
    <div className="py-4">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">Releases by Week</h1>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {formatDateShort(weekStart)} – {formatDateShort(weekEnd)}
            {releases.count ? ` · ${releases.count} titles` : ""}
          </p>
          <div className="flex items-center gap-1 text-sm">
            <Link
              href={`/week/${prev}${qs}`}
              className="rounded-md px-2 py-1 text-muted ring-1 ring-border hover:text-foreground"
            >
              ← Prev
            </Link>
            <Link
              href={`/week/${next}${qs}`}
              className="rounded-md px-2 py-1 text-muted ring-1 ring-border hover:text-foreground"
            >
              Next →
            </Link>
          </div>
        </div>
      </div>

      <Filters
        publishers={publishers.map((p) => ({ slug: p.slug, name: p.name }))}
      />

      {releases.buckets.length ? (
        releases.buckets.map((bucket) => (
          <DateSection
            key={bucket.date}
            bucket={bucket}
            kind="street"
            addedIds={addedIds}
          />
        ))
      ) : (
        <EmptyState
          title="No releases this week"
          hint={
            releases.error
              ? "Couldn't reach the catalog — check the migration and Supabase env vars."
              : "Nothing lands in this street-date week. Try Prev/Next or clear filters."
          }
          error={releases.error}
        />
      )}
    </div>
  );
}
