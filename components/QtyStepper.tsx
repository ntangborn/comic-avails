"use client";

import { useState, useTransition } from "react";
import { setPullListQty } from "@/app/pull-list/actions";

export function QtyStepper({ itemId, qty }: { itemId: number; qty: number }) {
  const [value, setValue] = useState(qty);
  const [pending, startTransition] = useTransition();

  function change(next: number) {
    if (next < 1) return; // removal is a separate control
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await setPullListQty(itemId, next);
      if (!res.ok) setValue(prev);
    });
  }

  return (
    <div className="inline-flex items-center rounded-md ring-1 ring-border">
      <button
        type="button"
        onClick={() => change(value - 1)}
        disabled={pending || value <= 1}
        className="h-7 w-7 rounded-l-md text-muted hover:bg-surface-2 disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="tnum w-7 text-center text-sm">{value}</span>
      <button
        type="button"
        onClick={() => change(value + 1)}
        disabled={pending}
        className="h-7 w-7 rounded-r-md text-muted hover:bg-surface-2 disabled:opacity-40"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
