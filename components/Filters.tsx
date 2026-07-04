"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FORMATS } from "@/lib/types";

export function Filters({
  publishers,
}: {
  publishers: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selectedPubs = (params.get("pub") ?? "").split(",").filter(Boolean);
  const format = params.get("format") ?? "";
  const q = params.get("q") ?? "";

  const [qLocal, setQLocal] = useState(q);
  useEffect(() => setQLocal(q), [q]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const anyActive = selectedPubs.length > 0 || format !== "" || q !== "";

  function push(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString());
    mut(p);
    const s = p.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function togglePub(slug: string) {
    push((p) => {
      const set = new Set(selectedPubs);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      if (set.size) p.set("pub", [...set].join(","));
      else p.delete("pub");
    });
  }

  function onSearch(v: string) {
    setQLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      push((p) => {
        if (v.trim()) p.set("q", v.trim());
        else p.delete("q");
      });
    }, 300);
  }

  return (
    <div className="mb-4 space-y-2.5">
      {/* Publisher chips */}
      <div className="flex flex-wrap gap-1.5">
        {publishers.map((pub) => {
          const on = selectedPubs.includes(pub.slug);
          return (
            <button
              key={pub.slug}
              type="button"
              onClick={() => togglePub(pub.slug)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-muted ring-1 ring-border hover:text-foreground"
              }`}
            >
              {pub.name}
            </button>
          );
        })}
      </div>

      {/* Format + search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={format}
          onChange={(e) =>
            push((p) => {
              if (e.target.value) p.set("format", e.target.value);
              else p.delete("format");
            })
          }
          className="rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-foreground ring-1 ring-border focus:outline-none focus:ring-accent"
        >
          <option value="">All formats</option>
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <input
          type="search"
          inputMode="search"
          value={qLocal}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search series, title, or creator…"
          className="flex-1 rounded-md bg-surface-2 px-3 py-1.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted focus:outline-none focus:ring-accent"
        />

        {anyActive && (
          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="rounded-md px-2.5 py-1.5 text-sm text-muted ring-1 ring-border hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
