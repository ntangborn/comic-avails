"use client";

import { useState } from "react";
import Link from "next/link";
import { AddToPullList } from "@/components/AddToPullList";
import { formatPrice } from "@/lib/format";

export interface VariantEntry {
  id: number;
  variant_code: string | null;
  cover_artist: string | null;
  price_cents: number | null;
  added: boolean;
}

export function VariantDisclosure({ variants }: { variants: VariantEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!variants.length) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-accent hover:underline"
      >
        {open ? "Hide variants" : `+${variants.length} variant${variants.length > 1 ? "s" : ""}`}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
          {variants.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <Link
                href={`/item/${v.id}`}
                className="min-w-0 truncate text-muted hover:text-foreground"
              >
                <span className="font-mono text-foreground">
                  Cover {v.variant_code ?? "—"}
                </span>
                {v.cover_artist ? ` · ${v.cover_artist}` : ""}
              </Link>
              <div className="flex items-center gap-2">
                <span className="tnum text-muted">{formatPrice(v.price_cents)}</span>
                <AddToPullList itemId={v.id} added={v.added} compact />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
