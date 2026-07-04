import { getFocThisWeek, getPublishers, type CatalogFilters } from "@/lib/catalog";
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

  const [publishers, foc, addedIds] = await Promise.all([
    getPublishers(),
    getFocThisWeek(filters),
    getPullListItemIds(),
  ]);

  return (
    <div className="py-4">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">This Week&apos;s FOC</h1>
        <p className="text-sm text-muted">
          Order-by deadlines in the next 7 days
          {foc.count ? ` · ${foc.count} titles` : ""}
        </p>
      </div>

      <Filters
        publishers={publishers.map((p) => ({ slug: p.slug, name: p.name }))}
      />

      {foc.buckets.length ? (
        foc.buckets.map((bucket) => (
          <DateSection
            key={bucket.date}
            bucket={bucket}
            kind="foc"
            addedIds={addedIds}
          />
        ))
      ) : (
        <EmptyState
          title="No FOC deadlines in the next 7 days"
          hint={
            foc.error
              ? "Couldn't reach the catalog — check that the migration is applied and Supabase env vars are set."
              : "Nothing is due to be ordered this week. Run an ingest to populate upcoming solicitations, or check the weekly view."
          }
          error={foc.error}
        />
      )}
    </div>
  );
}
