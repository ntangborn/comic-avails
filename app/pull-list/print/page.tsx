import { getPullListLines } from "@/lib/pull-list";
import {
  buildExportRows,
  groupForPrint,
  getPullListMeta,
} from "@/lib/pull-list-export";
import { PrintToolbar } from "@/components/PrintToolbar";
import { formatPrice, formatDateLong, formatDateShort, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function PullListPrintPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const auto = (Array.isArray(sp.auto) ? sp.auto[0] : sp.auto) === "1";

  const [lines, meta] = await Promise.all([
    getPullListLines(),
    getPullListMeta(),
  ]);
  const rows = buildExportRows(lines);
  const groups = groupForPrint(rows);
  const totalTitles = rows.length;
  const totalBooks = rows.reduce((n, r) => n + r.qty, 0);
  const generated = formatDateLong(todayISO());

  return (
    <div className="py-4">
      <PrintToolbar auto={auto} />

      {/* The document "sheet" — light B&W regardless of the app's dark theme. */}
      <div className="mx-auto max-w-3xl bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* Header block */}
        <div className="mb-4 flex items-start justify-between gap-4 border-b-2 border-black pb-2">
          <div>
            <h1 className="text-lg font-bold">Pull List</h1>
            <div className="text-sm">
              {meta.customerName ? <div>{meta.customerName}</div> : null}
              {meta.shopName ? (
                <div className="text-neutral-600">{meta.shopName}</div>
              ) : null}
            </div>
          </div>
          <div className="text-right text-xs text-neutral-600">
            <div>Generated {generated}</div>
            <div>
              {totalTitles} title{totalTitles === 1 ? "" : "s"} · {totalBooks} book
              {totalBooks === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {totalTitles === 0 ? (
          <p className="text-sm text-neutral-600">
            This pull list is empty — add titles from the catalog first.
          </p>
        ) : (
          groups.map((g) => (
            <section
              key={g.streetDate ?? "no-date"}
              className="print-avoid-break mb-3"
            >
              <h2 className="mb-1 border-b border-black text-sm font-bold">
                {g.streetDate
                  ? `On sale ${formatDateLong(g.streetDate)}`
                  : "On-sale date TBD"}
              </h2>
              {g.publishers.map((pub) => (
                <div key={pub.publisher} className="mb-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide">
                    {pub.publisher || "Unknown publisher"}
                  </h3>
                  <table className="w-full border-collapse text-[11px] leading-tight">
                    <thead>
                      <tr className="border-b border-neutral-400 text-left text-neutral-600">
                        <th className="w-20 py-0.5 pr-2 font-medium">Code</th>
                        <th className="py-0.5 pr-2 font-medium">Series / Title</th>
                        <th className="w-10 py-0.5 pr-2 font-medium">Iss</th>
                        <th className="w-10 py-0.5 pr-2 font-medium">Var</th>
                        <th className="w-14 py-0.5 pr-2 text-right font-medium">
                          Price
                        </th>
                        <th className="w-16 py-0.5 pr-2 font-medium">FOC</th>
                        <th className="w-8 py-0.5 text-right font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pub.rows.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-neutral-200 align-top"
                        >
                          <td className="py-0.5 pr-2 font-mono text-[10px]">
                            {r.itemCode || " "}
                          </td>
                          <td className="py-0.5 pr-2">{r.series}</td>
                          <td className="py-0.5 pr-2 tnum">{r.issue}</td>
                          <td className="py-0.5 pr-2">{r.variant}</td>
                          <td className="py-0.5 pr-2 text-right tnum">
                            {r.priceCents == null ? "" : formatPrice(r.priceCents)}
                          </td>
                          <td className="py-0.5 pr-2 tnum">
                            {r.focDate ? formatDateShort(r.focDate) : ""}
                          </td>
                          <td className="py-0.5 text-right tnum font-semibold">
                            {r.qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
