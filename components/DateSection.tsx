import type { DateBucket } from "@/lib/types";
import { ItemRow } from "@/components/ItemRow";
import { FocBadge } from "@/components/FocBadge";
import { formatDateLong } from "@/lib/format";

/**
 * Renders one date bucket (a FOC date or a street date) with its publisher
 * sub-groups. `kind` picks the header treatment:
 *  - "foc": the date header carries the FOC countdown badge; rows omit it.
 *  - "street": rows show their own FOC badge (useful on the weekly view).
 */
export function DateSection({
  bucket,
  kind,
  addedIds,
}: {
  bucket: DateBucket;
  kind: "foc" | "street";
  addedIds: Set<number>;
}) {
  const count = bucket.publishers.reduce((n, p) => n + p.groups.length, 0);
  return (
    <section className="mb-6">
      <div className="sticky top-[49px] z-10 -mx-3 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <h2 className="text-sm font-semibold sm:text-base">
          {formatDateLong(bucket.date)}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{count} titles</span>
          {kind === "foc" && <FocBadge foc={bucket.date} />}
        </div>
      </div>

      {bucket.publishers.map((pub) => (
        <div key={pub.publisher.id} className="mt-2">
          <h3 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-accent">
            {pub.publisher.name}
            <span className="ml-1.5 font-normal text-muted">
              {pub.groups.length}
            </span>
          </h3>
          <ul>
            {pub.groups.map((g) => (
              <ItemRow
                key={g.key}
                group={g}
                addedIds={addedIds}
                showFoc={kind === "street"}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
