"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "This Week's FOC", match: (p: string) => p === "/" },
  { href: "/week", label: "By Week", match: (p: string) => p.startsWith("/week") },
  {
    href: "/pull-list",
    label: "Pull List",
    match: (p: string) => p.startsWith("/pull-list"),
  },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-3 sm:px-5">
        <Link href="/" className="mr-2 shrink-0 py-3 font-semibold tracking-tight">
          <span className="text-accent">◆</span> Comic Avails
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
