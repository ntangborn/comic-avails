/** Shared types for the catalog / pull-list UI. */

export interface PublisherRef {
  id: number;
  name: string;
  slug: string;
}

export interface SeriesRef {
  id: number;
  name: string;
}

export interface CreatorCredit {
  role: string;
  name: string;
}

/** A single catalog item (one product / one variant cover). */
export interface CatalogItem {
  id: number;
  series_id: number | null;
  publisher_id: number;
  title_raw: string;
  issue_number: string | null;
  format: string | null;
  variant_code: string | null;
  cover_artist: string | null;
  price_cents: number | null;
  street_date: string | null; // YYYY-MM-DD
  foc_date: string | null; // YYYY-MM-DD
  solicit_text: string | null;
  cover_url: string | null;
  item_code_lunar: string | null;
  item_code_prh: string | null;
  status: string;
  series: SeriesRef | null;
  publisher: PublisherRef | null;
  credits: CreatorCredit[];
}

/** One issue and its variant covers, collapsed for display. */
export interface VariantGroup {
  key: string;
  main: CatalogItem;
  variants: CatalogItem[]; // additional covers beyond `main`
}

/** Items for one publisher within a date bucket. */
export interface PublisherBucket {
  publisher: PublisherRef;
  groups: VariantGroup[];
}

/** A date (FOC date or street date) with its publisher buckets. */
export interface DateBucket {
  date: string; // YYYY-MM-DD
  publishers: PublisherBucket[];
}

/** A pull-list line: the catalog item plus list-specific fields. */
export interface PullListLine {
  pull_list_item_id: number;
  qty: number;
  state: string;
  item: CatalogItem;
}

export const FORMATS = [
  { value: "single_issue", label: "Single issue" },
  { value: "trade_paperback", label: "Trade paperback" },
  { value: "hardcover", label: "Hardcover" },
  { value: "omnibus", label: "Omnibus" },
  { value: "other", label: "Other" },
] as const;

export type FormatValue = (typeof FORMATS)[number]["value"];
