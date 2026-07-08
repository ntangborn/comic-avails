import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getPullListLines } from "@/lib/pull-list";
import {
  buildExportRows,
  groupForPrint,
  getPullListMeta,
  exportFilename,
} from "@/lib/pull-list-export";
import { formatPrice, formatDateLong, formatDateShort, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// US Letter, points.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const LEFT = MARGIN;
const RIGHT = PAGE_W - MARGIN;
const BOTTOM = MARGIN;

// Column x-anchors (left edge unless noted).
const COL = {
  code: LEFT,
  title: 112,
  iss: 376,
  var: 408,
  priceRight: 486, // right-aligned
  foc: 494,
  qtyRight: RIGHT, // right-aligned
};

const ROW_H = 11;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);

/** GET /pull-list/export/pdf — the pull list as a server-rendered PDF download. */
export async function GET(): Promise<Response> {
  const [lines, meta] = await Promise.all([
    getPullListLines(),
    getPullListMeta(),
  ]);
  const groups = groupForPrint(buildExportRows(lines));
  const totalTitles = groups.reduce(
    (n, g) => n + g.publishers.reduce((m, p) => m + p.rows.length, 0),
    0,
  );
  const totalBooks = groups.reduce(
    (n, g) =>
      n + g.publishers.reduce((m, p) => m + p.rows.reduce((s, r) => s + r.qty, 0), 0),
    0,
  );

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (
    s: string,
    x: number,
    size: number,
    f: PDFFont,
    color = BLACK,
  ) => page.drawText(s, { x, y, size, font: f, color });

  const textRight = (s: string, xRight: number, size: number, f: PDFFont) =>
    page.drawText(s, {
      x: xRight - f.widthOfTextAtSize(s, size),
      y,
      size,
      font: f,
      color: BLACK,
    });

  const line = (yy: number, thick = 0.5, color = BLACK) =>
    page.drawLine({
      start: { x: LEFT, y: yy },
      end: { x: RIGHT, y: yy },
      thickness: thick,
      color,
    });

  const fit = (s: string, f: PDFFont, size: number, maxW: number): string => {
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(out + "…", size) > maxW) {
      out = out.slice(0, -1);
    }
    return out + "…";
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const drawColHeader = () => {
    text("Code", COL.code, 7, bold, GREY);
    text("Series / Title", COL.title, 7, bold, GREY);
    text("Iss", COL.iss, 7, bold, GREY);
    text("Var", COL.var, 7, bold, GREY);
    textRight("Price", COL.priceRight, 7, bold);
    text("FOC", COL.foc, 7, bold, GREY);
    textRight("Qty", COL.qtyRight, 7, bold);
    y -= 3;
    line(y);
    y -= ROW_H;
  };

  // --- Header block ---
  text("Pull List", LEFT, 16, bold);
  y -= 18;
  if (meta.customerName) {
    text(meta.customerName, LEFT, 10, font);
    y -= 12;
  }
  if (meta.shopName) {
    text(meta.shopName, LEFT, 9, font, GREY);
    y -= 12;
  }
  text(
    `Generated ${formatDateLong(todayISO())}  ·  ${totalTitles} title${
      totalTitles === 1 ? "" : "s"
    }  ·  ${totalBooks} book${totalBooks === 1 ? "" : "s"}`,
    LEFT,
    9,
    font,
    GREY,
  );
  y -= 8;
  line(y, 1);
  y -= 16;

  if (totalTitles === 0) {
    text("This pull list is empty — add titles from the catalog first.", LEFT, 10, font, GREY);
  }

  for (const g of groups) {
    // Section (street-date) header.
    if (y - 30 < BOTTOM) newPage();
    const label = g.streetDate
      ? `On sale ${formatDateLong(g.streetDate)}`
      : "On-sale date TBD";
    text(label, LEFT, 10, bold);
    y -= 3;
    line(y);
    y -= 14;

    for (const pub of g.publishers) {
      if (y - (ROW_H + 14) < BOTTOM) newPage();
      text((pub.publisher || "Unknown publisher").toUpperCase(), LEFT, 8, bold);
      y -= 12;
      drawColHeader();

      for (const r of pub.rows) {
        if (y - ROW_H < BOTTOM) {
          newPage();
          text(`${(pub.publisher || "Unknown").toUpperCase()} (cont.)`, LEFT, 8, bold);
          y -= 12;
          drawColHeader();
        }
        text(fit(r.itemCode, font, 8, 66), COL.code, 8, font);
        text(fit(r.series, font, 8, COL.iss - COL.title - 6), COL.title, 8, font);
        text(fit(r.issue, font, 8, 24), COL.iss, 8, font);
        text(fit(r.variant, font, 8, 24), COL.var, 8, font);
        if (r.priceCents != null) textRight(formatPrice(r.priceCents), COL.priceRight, 8, font);
        if (r.focDate) text(formatDateShort(r.focDate), COL.foc, 8, font);
        textRight(String(r.qty), COL.qtyRight, 8, bold);
        y -= 2;
        line(y, 0.25, rgb(0.85, 0.85, 0.85));
        y -= ROW_H - 2;
      }
      y -= 4; // gap after a publisher block
    }
    y -= 6; // gap after a date section
  }

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${exportFilename("pdf", todayISO())}"`,
      "Cache-Control": "no-store",
    },
  });
}
