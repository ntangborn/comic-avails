"use client";

import { useState, useTransition } from "react";
import { addToPullList, removeFromPullList } from "@/app/pull-list/actions";

export function AddToPullList({
  itemId,
  added = false,
  compact = false,
}: {
  itemId: number;
  added?: boolean;
  compact?: boolean;
}) {
  const [isAdded, setIsAdded] = useState(added);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = isAdded
        ? await removeFromPullList(itemId)
        : await addToPullList(itemId);
      if (res.ok) setIsAdded((v) => !v);
      else setError(res.error ?? "Failed");
    });
  }

  const base = compact
    ? "px-2 py-0.5 text-xs"
    : "px-2.5 py-1 text-xs sm:text-sm";
  const style = isAdded
    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
    : "bg-surface-2 text-foreground ring-1 ring-border hover:bg-border";

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={error ?? undefined}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md font-medium transition-colors disabled:opacity-50 ${base} ${style}`}
      >
        {pending ? "…" : isAdded ? "✓ On list" : "+ Add"}
      </button>
      {error && (
        <span className="mt-1 max-w-[10rem] text-right text-[10px] leading-tight text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
