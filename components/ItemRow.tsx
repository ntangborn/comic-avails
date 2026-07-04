import Link from "next/link";
import type { VariantGroup } from "@/lib/types";
import { CoverThumb } from "@/components/CoverThumb";
import { FocBadge } from "@/components/FocBadge";
import { AddToPullList } from "@/components/AddToPullList";
import { VariantDisclosure } from "@/components/VariantDisclosure";
import { formatBadge, formatPrice, formatDateShort } from "@/lib/format";

function creditsLine(credits: { role: string; name: string }[]): string {
  const writers = credits
    .filter((c) => /writ|script/i.test(c.role))
    .map((c) => c.name);
  const artists = credits
    .filter((c) => /art|pencil|illustrat/i.test(c.role))
    .map((c) => c.name);
  const parts: string[] = [];
  if (writers.length) parts.push(writers.slice(0, 2).join(", "));
  if (artists.length) parts.push(artists.slice(0, 2).join(", "));
  return parts.join(" · ");
}

export function ItemRow({
  group,
  addedIds,
  showFoc = true,
}: {
  group: VariantGroup;
  addedIds: Set<number>;
  showFoc?: boolean;
}) {
  const { main, variants } = group;
  const seriesName = main.series?.name ?? main.title_raw;
  const credits = creditsLine(main.credits);

  return (
    <li className="flex gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <CoverThumb item={main} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/item/${main.id}`}
              className="font-medium leading-snug hover:underline"
            >
              {seriesName}
              {main.issue_number ? (
                <span className="text-muted"> #{main.issue_number}</span>
              ) : null}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 ring-1 ring-border">
                {formatBadge(main.format)}
              </span>
              <span className="tnum text-foreground">
                {formatPrice(main.price_cents)}
              </span>
              <span className="tnum">St {formatDateShort(main.street_date)}</span>
              {credits && <span className="truncate">{credits}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {showFoc && <FocBadge foc={main.foc_date} size="sm" />}
            <AddToPullList itemId={main.id} added={addedIds.has(main.id)} />
          </div>
        </div>
        <VariantDisclosure
          variants={variants.map((v) => ({
            id: v.id,
            variant_code: v.variant_code,
            cover_artist: v.cover_artist,
            price_cents: v.price_cents,
            added: addedIds.has(v.id),
          }))}
        />
      </div>
    </li>
  );
}
