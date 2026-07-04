/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getItemDetail } from "@/lib/catalog";
import { getPullListItemIds } from "@/lib/pull-list";
import { FocBadge } from "@/components/FocBadge";
import { AddToPullList } from "@/components/AddToPullList";
import { EmptyState } from "@/components/EmptyState";
import type { CreatorCredit, CatalogItem } from "@/lib/types";
import {
  formatBadge,
  formatPrice,
  formatDateLong,
} from "@/lib/format";

export const dynamic = "force-dynamic";

function groupCredits(credits: CreatorCredit[]) {
  const buckets: Record<string, string[]> = {
    Writer: [],
    Artist: [],
    Cover: [],
    Other: [],
  };
  for (const c of credits) {
    if (/writ|script/i.test(c.role)) buckets.Writer.push(c.name);
    else if (/cover/i.test(c.role)) buckets.Cover.push(c.name);
    else if (/art|pencil|ink|color|illustrat/i.test(c.role))
      buckets.Artist.push(c.name);
    else buckets.Other.push(`${c.name} (${c.role})`);
  }
  return buckets;
}

function BigCover({ item }: { item: CatalogItem }) {
  if (item.cover_url) {
    return (
      <img
        src={item.cover_url}
        alt={item.title_raw}
        className="w-40 rounded-md object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div className="flex aspect-[2/3] w-40 items-center justify-center rounded-md bg-surface-2 text-3xl font-semibold text-muted ring-1 ring-border">
      {(item.publisher?.name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();

  const [{ item, variants, error }, addedIds] = await Promise.all([
    getItemDetail(n),
    getPullListItemIds(),
  ]);

  if (!item) {
    if (error) {
      return (
        <div className="py-6">
          <EmptyState
            title="Couldn't load this item"
            hint="Check the migration and Supabase env vars."
            error={error}
          />
        </div>
      );
    }
    notFound();
  }

  const seriesName = item.series?.name ?? item.title_raw;
  const credits = groupCredits(item.credits);

  return (
    <div className="py-4">
      <Link
        href="/"
        className="text-sm text-muted hover:text-foreground"
      >
        ← Back
      </Link>

      <div className="mt-3 flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0">
          <BigCover item={item} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {item.publisher?.name}
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">
                {seriesName}
                {item.issue_number ? (
                  <span className="text-muted"> #{item.issue_number}</span>
                ) : null}
              </h1>
              {item.variant_code && (
                <p className="mt-0.5 text-sm text-muted">
                  Cover {item.variant_code}
                  {item.cover_artist ? ` · ${item.cover_artist}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <FocBadge foc={item.foc_date} />
              <AddToPullList itemId={item.id} added={addedIds.has(item.id)} />
            </div>
          </div>

          {/* Facts */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Fact label="Format" value={formatBadge(item.format)} />
            <Fact label="Price" value={formatPrice(item.price_cents)} />
            <Fact label="Street date" value={formatDateLong(item.street_date)} />
            <Fact label="FOC date" value={formatDateLong(item.foc_date)} />
            <Fact label="Status" value={item.status} />
            {item.item_code_lunar && (
              <Fact label="Lunar code" value={item.item_code_lunar} mono />
            )}
            {item.item_code_prh && (
              <Fact label="PRH code" value={item.item_code_prh} mono />
            )}
          </dl>

          {/* Creators */}
          {item.credits.length > 0 && (
            <div className="mt-4 space-y-1 text-sm">
              {(["Writer", "Artist", "Cover", "Other"] as const).map((role) =>
                credits[role].length ? (
                  <p key={role}>
                    <span className="text-muted">{role}: </span>
                    <span>{credits[role].join(", ")}</span>
                  </p>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>

      {/* Solicit text */}
      {item.solicit_text && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold text-muted">Solicitation</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {item.solicit_text}
          </p>
        </div>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">
            Variant covers ({variants.length})
          </h2>
          <ul className="divide-y divide-border/60">
            {variants.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <Link
                  href={`/item/${v.id}`}
                  className="min-w-0 truncate hover:underline"
                >
                  <span className="font-mono">Cover {v.variant_code ?? "—"}</span>
                  {v.cover_artist ? (
                    <span className="text-muted"> · {v.cover_artist}</span>
                  ) : null}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="tnum text-muted">
                    {formatPrice(v.price_cents)}
                  </span>
                  <AddToPullList
                    itemId={v.id}
                    added={addedIds.has(v.id)}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
