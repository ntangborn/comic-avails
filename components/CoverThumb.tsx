/* eslint-disable @next/next/no-img-element */
import type { CatalogItem } from "@/lib/types";

/**
 * Cover thumbnail. Uses `cover_url` when present, otherwise a placeholder tile
 * with the publisher initial. Plain <img> (covers are arbitrary external URLs;
 * next/image remote patterns aren't configured yet).
 */
export function CoverThumb({
  item,
  size = "md",
}: {
  item: CatalogItem;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-14 w-9" : "h-20 w-[3.4rem]";
  if (item.cover_url) {
    return (
      <img
        src={item.cover_url}
        alt={item.title_raw}
        className={`${dims} shrink-0 rounded-sm object-cover ring-1 ring-border`}
        loading="lazy"
      />
    );
  }
  const initial = (item.publisher?.name ?? "?").charAt(0).toUpperCase();
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center rounded-sm bg-surface-2 text-sm font-semibold text-muted ring-1 ring-border`}
      aria-hidden
    >
      {initial}
    </div>
  );
}
