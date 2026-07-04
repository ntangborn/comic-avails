import Link from "next/link";
import { getPullListLines } from "@/lib/pull-list";
import { pullListConfigured } from "@/lib/supabase/server";
import { CoverThumb } from "@/components/CoverThumb";
import { FocBadge } from "@/components/FocBadge";
import { QtyStepper } from "@/components/QtyStepper";
import { RemoveButton } from "@/components/RemoveButton";
import { EmptyState } from "@/components/EmptyState";
import type { PullListLine } from "@/lib/types";
import {
  formatBadge,
  formatPrice,
  formatDateShort,
  formatDateLong,
} from "@/lib/format";

export const dynamic = "force-dynamic";

function groupByFoc(lines: PullListLine[]): { date: string | null; lines: PullListLine[] }[] {
  const map = new Map<string, PullListLine[]>();
  for (const line of lines) {
    const key = line.item.foc_date ?? "";
    const arr = map.get(key);
    if (arr) arr.push(line);
    else map.set(key, [line]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "") return 1; // null FOC last
    if (b === "") return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({ date: k === "" ? null : k, lines: map.get(k)! }));
}

export default async function PullListPage() {
  const configured = pullListConfigured();
  const lines = await getPullListLines();

  const totalTitles = lines.length;
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  const groups = groupByFoc(lines);

  return (
    <div className="py-4">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pull List</h1>
          <p className="text-sm text-muted">
            {totalTitles} title{totalTitles === 1 ? "" : "s"} · {totalQty} book
            {totalQty === 1 ? "" : "s"}
          </p>
        </div>
        <span className="rounded-md px-2.5 py-1.5 text-xs text-muted ring-1 ring-border">
          Print / export — next (Part 4.2)
        </span>
      </div>

      {!configured ? (
        <EmptyState
          title="Pull list not configured yet"
          hint="Set SUPABASE_SECRET_KEY (sb_secret_…) and DEMO_USER_ID (the UUID of a Supabase Auth user) in .env.local, then add items from the catalog."
        />
      ) : totalTitles === 0 ? (
        <EmptyState
          title="Your pull list is empty"
          hint="Browse This Week's FOC or the weekly view and tap “+ Add” on any title."
        />
      ) : (
        groups.map((group) => (
          <section key={group.date ?? "no-foc"} className="mb-6">
            <div className="sticky top-[49px] z-10 -mx-3 flex items-center justify-between border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
              <h2 className="text-sm font-semibold">
                {group.date ? formatDateLong(group.date) : "No FOC date"}
              </h2>
              {group.date && <FocBadge foc={group.date} />}
            </div>
            <ul>
              {group.lines.map((line) => {
                const it = line.item;
                const seriesName = it.series?.name ?? it.title_raw;
                return (
                  <li
                    key={line.pull_list_item_id}
                    className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0"
                  >
                    <CoverThumb item={it} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/item/${it.id}`}
                        className="font-medium hover:underline"
                      >
                        {seriesName}
                        {it.issue_number ? (
                          <span className="text-muted"> #{it.issue_number}</span>
                        ) : null}
                        {it.variant_code ? (
                          <span className="ml-1 font-mono text-xs text-muted">
                            {it.variant_code}
                          </span>
                        ) : null}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{it.publisher?.name}</span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 ring-1 ring-border">
                          {formatBadge(it.format)}
                        </span>
                        <span className="tnum text-foreground">
                          {formatPrice(it.price_cents)}
                        </span>
                        <span className="tnum">
                          St {formatDateShort(it.street_date)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <QtyStepper itemId={it.id} qty={line.qty} />
                      <RemoveButton itemId={it.id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
