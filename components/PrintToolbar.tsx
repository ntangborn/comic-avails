"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Screen-only toolbar for the pull-list print view: back to the list, a manual
 * Print button, and CSV/PDF download links. When `auto` is set (the "Print"
 * button on the pull-list page links here with ?auto=1) it opens the browser
 * print dialog once on load. Hidden on paper via [data-noprint] (see globals.css).
 */
export function PrintToolbar({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    // Small delay so fonts/layout settle before the print dialog snapshots it.
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <div
      data-noprint
      className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3"
    >
      <Link
        href="/pull-list"
        className="rounded-md px-2.5 py-1.5 text-sm text-muted ring-1 ring-border hover:text-foreground"
      >
        ← Back to list
      </Link>
      <button
        onClick={() => window.print()}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90"
      >
        Print
      </button>
      <a
        href="/pull-list/export/csv"
        className="rounded-md px-2.5 py-1.5 text-sm text-muted ring-1 ring-border hover:text-foreground"
      >
        Download CSV
      </a>
      <a
        href="/pull-list/export/pdf"
        className="rounded-md px-2.5 py-1.5 text-sm text-muted ring-1 ring-border hover:text-foreground"
      >
        Download PDF
      </a>
    </div>
  );
}
