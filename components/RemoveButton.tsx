"use client";

import { useTransition } from "react";
import { removeFromPullList } from "@/app/pull-list/actions";

export function RemoveButton({ itemId }: { itemId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await removeFromPullList(itemId);
        })
      }
      disabled={pending}
      className="rounded-md px-2 py-1 text-xs text-muted ring-1 ring-border hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
      aria-label="Remove from pull list"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
