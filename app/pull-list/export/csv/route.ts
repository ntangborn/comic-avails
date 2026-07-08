import { getPullListLines } from "@/lib/pull-list";
import { buildExportRows, toCSV, exportFilename } from "@/lib/pull-list-export";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /pull-list/export/csv — the pull list as a CSV download. */
export async function GET(): Promise<Response> {
  const lines = await getPullListLines();
  const csv = toCSV(buildExportRows(lines));
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("csv", todayISO())}"`,
      "Cache-Control": "no-store",
    },
  });
}
