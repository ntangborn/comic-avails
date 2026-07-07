import Link from "next/link";
import {
  getUpcomingReleases,
  getPublishers,
  type CatalogFilters,
} from "@/lib/catalog";
import { getPullListItemIds } from "@/lib/pull-list";
import { Filters } from "@/components/Filters";
import { DateSection } from "@/components/DateSection";
import { EmptyState } from "@/components/EmptyState";

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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [publishers, upcoming, addedIds] = await Promise.all([
    getPublishers(),
    getUpcomingReleases(filters),
    getPullListItemIds(),
  ]);

  const laterCount = upcoming.total - upcoming.count;

  return (
    <div className="py-4">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">Upcoming Releases</h1>
        <p className="text-sm text-muted">
          Soonest on-sale dates
          {upcoming.count ? ` · ${upcoming.count} titles` : ""}
          {laterCount > 0 ? ` · ${laterCount} more later` : ""}
        </p>
      </div>

      <Filters
        publishers={publishers.map((p) => ({ slug: p.slug, name: p.name }))}
      />

      {upcoming.buckets.length ? (
        <>
          {upcoming.buckets.map((bucket) => (
            <DateSection
              key={bucket.date}
              bucket={bucket}
              kind="street"
              showRowFoc={false}
              addedIds={addedIds}
            />
          ))}
          {upcoming.hiddenDates > 0 && (
            <div className="pt-1 text-center text-sm">
              <Link
                href="/week"
                className="inline-block rounded-md px-3 py-1.5 text-accent ring-1 ring-border hover:bg-surface-2"
              >
                Browse all releases by week →
              </Link>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="No upcoming releases"
          hint={
            upcoming.error
              ? "Couldn't reach the catalog — check that the migration is applied and Supabase env vars are set."
              : "Nothing is solicited for an upcoming on-sale date. Run an ingest to populate solicitations, or check the weekly view."
          }
          error={upcoming.error}
        />
      )}
    </div>
  );
}
