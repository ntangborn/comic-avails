/**
 * scripts/lib/sources.ts
 *
 * Solicitation source registry — the single place that answers "where do this
 * publisher's monthly solicits live, and what's the current URL?"
 *
 * Why a registry (not hardcoded URLs in each script): comicreleases.com URLs
 * change every month (`dc-september-2026-solicitations`, posted ~3 months
 * ahead under a /YYYY/MM/ path). Hardcoding rots monthly. Instead we store the
 * STABLE pieces — the per-publisher URL slug and the monthly index page — and
 * discover the current post from the index. `current` is a convenience cache of
 * the latest known-good URL (refreshed by discovery); treat `verified: false`
 * entries as "confirm before trusting".
 *
 * Slug note: `slug` matches publishers.slug in the DB; `urlSlug` is the token
 * comicreleases uses in the post path (e.g. Boom -> "boom", Dark Horse ->
 * "dark-horse", Oni Press -> "oni-press"). They are NOT always the same.
 *
 * Verified against comicreleases.com search results on 2026-07-03. The latest
 * posted window at that time was September 2026 (posted under /2026/06/).
 */

export type Aggregator = "comicreleases" | "bleedingcool" | "comicsbeat";

export interface SolicitSource {
  /** Internal publisher slug — matches publishers.slug in the DB. */
  slug: string;
  /** Display name. */
  publisher: string;
  /** Current direct-market distributor (PRD §4.1) — for later reconciliation. */
  distributor: "Lunar" | "Penguin Random House" | "Universal";
  /** Which aggregator we primarily parse. */
  aggregator: Aggregator;
  /** The token comicreleases uses in the post path (may differ from `slug`). */
  urlSlug: string;
  /** Latest known-good monthly solicit URL. */
  current: {
    /** Solicit month the URL covers, e.g. "2026-09". */
    month: string;
    url: string;
    /** true = URL confirmed live/searchable; false = inferred, verify first. */
    verified: boolean;
  };
  /** Alternate sources when the primary aggregator's coverage is spotty. */
  fallbackSources?: string[];
  notes?: string;
}

/**
 * Build the stable monthly INDEX url on comicreleases.com. This page lists every
 * publisher's post for that month — the anchor for going-forward discovery.
 *   monthlyIndexUrl(2026, 9) -> https://www.comicreleases.com/category/solicitations/2026/2026-09/
 */
export function monthlyIndexUrl(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `https://www.comicreleases.com/category/solicitations/${year}/${year}-${mm}/`;
}

/** The solicit month this registry's `current` URLs target. */
export const CURRENT_SOLICIT_MONTH = "2026-09";

/**
 * Registry. Publishers are the PRD §2 MVP set. DC is validated (ingest-dc.ts).
 * Ingest priority order follows the build guide Part 6:
 *   DC -> Marvel -> Image -> Boom -> Dark Horse -> Titan -> Dynamite -> Oni -> IDW -> Mad Cave
 */
export const SOLICIT_SOURCES: SolicitSource[] = [
  {
    slug: "dc",
    publisher: "DC",
    distributor: "Lunar",
    aggregator: "comicreleases",
    urlSlug: "dc",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/dc-september-2026-solicitations/",
      verified: true,
    },
    notes: "Validated publisher (ingest-dc.ts). Tuesday street dates.",
  },
  {
    slug: "marvel",
    publisher: "Marvel",
    distributor: "Penguin Random House",
    aggregator: "comicreleases",
    urlSlug: "marvel",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/marvel-september-2026-solicitations/",
      verified: true,
    },
  },
  {
    slug: "image",
    publisher: "Image",
    distributor: "Lunar",
    aggregator: "comicreleases",
    urlSlug: "image",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/image-september-2026-solicitations/",
      verified: true,
    },
  },
  {
    slug: "boom-studios",
    publisher: "Boom! Studios",
    distributor: "Penguin Random House",
    aggregator: "comicreleases",
    urlSlug: "boom", // NOTE: "boom", not "boom-studios"
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/boom-september-2026-solicitations/",
      verified: true,
    },
  },
  {
    slug: "dark-horse",
    publisher: "Dark Horse",
    distributor: "Penguin Random House",
    aggregator: "comicreleases",
    urlSlug: "dark-horse",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/dark-horse-september-2026-solicitations/",
      verified: true,
    },
    notes: "Slug occasionally singular ('...-solicitation') — see Dark Horse April 2026. Discover via index rather than constructing.",
  },
  {
    slug: "titan",
    publisher: "Titan",
    distributor: "Lunar",
    aggregator: "comicreleases",
    urlSlug: "titan",
    current: {
      month: "2026-08",
      url: "https://www.comicreleases.com/2026/05/titan-august-2026-solicitations/",
      verified: true,
    },
    fallbackSources: [
      "https://comicsolicitations.com/september-2026/titan-comics",
    ],
    notes: "August is the last comicreleases URL confirmed via search. Sept likely at /2026/06/titan-september-2026-solicitations/ but UNVERIFIED — confirm via the monthly index before trusting.",
  },
  {
    slug: "dynamite",
    publisher: "Dynamite",
    distributor: "Lunar",
    aggregator: "comicreleases",
    urlSlug: "dynamite",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/dynamite-september-2026-solicitations/",
      verified: true,
    },
    notes: "Dual-distributed (Lunar + Universal). If distributor-sourced data is added later, dedupe on publisher item code so books don't appear twice.",
  },
  {
    slug: "oni-press",
    publisher: "Oni Press",
    distributor: "Penguin Random House", // switched Lunar -> PRH on 2026-08-01
    aggregator: "bleedingcool",
    urlSlug: "oni-press",
    current: {
      month: "2026-07",
      url: "https://www.comicreleases.com/2026/04/oni-press-july-2026-solicitations/",
      verified: true,
    },
    fallbackSources: [
      "https://www.comicsbeat.com/oni-press-september-2026-solicitations/",
      "https://bleedingcool.com/comics/comics-publishers/oni-press/",
    ],
    notes: "COVERAGE GAP: Oni's Aug/Sept solicits did NOT surface on comicreleases after its 2026-08-01 switch to PRH. Last confirmed comicreleases URL is July. Aug/Sept appear on Bleeding Cool / Comics Beat instead — needs a fallback source or a PRH-catalog path. Watch for a solicit-format change post-PRH.",
  },
  {
    slug: "idw",
    publisher: "IDW",
    distributor: "Penguin Random House",
    aggregator: "comicreleases",
    urlSlug: "idw",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/idw-september-2026-solicitations/",
      verified: true,
    },
  },
  {
    slug: "mad-cave",
    publisher: "Mad Cave",
    distributor: "Lunar",
    aggregator: "comicreleases",
    urlSlug: "mad-cave",
    current: {
      month: "2026-09",
      url: "https://www.comicreleases.com/2026/06/mad-cave-september-2026-solicitations/",
      verified: true,
    },
    notes: "Slug sometimes omits the month ('mad-cave-2026-solicitations', April 2026). Discover via index rather than constructing.",
  },
];

/** Convenience lookup by DB slug. */
export function sourceForSlug(slug: string): SolicitSource | undefined {
  return SOLICIT_SOURCES.find((s) => s.slug === slug);
}
