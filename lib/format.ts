/** Date / price / FOC formatting helpers. Dates are DATE strings (YYYY-MM-DD),
 *  treated as calendar dates in local time — no timezone math on the DB values. */

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a local Date at midnight. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysISO(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday of the week containing `iso` (ISO week, Mon–Sun). */
export function mondayOfWeekISO(iso: string): string {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

/** Whole days from today to `iso` (negative = past). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const start = parseISO(todayISO(now)).getTime();
  const target = parseISO(iso).getTime();
  return Math.round((target - start) / 86_400_000);
}

export type FocTone = "overdue" | "urgent" | "soon" | "later";

export interface FocCountdown {
  days: number;
  label: string;
  tone: FocTone;
}

/** "FOC in 3 days" style countdown with an urgency tone. */
export function focCountdown(
  focISO: string | null,
  now: Date = new Date(),
): FocCountdown | null {
  if (!focISO) return null;
  const days = daysUntil(focISO, now);
  let label: string;
  let tone: FocTone;
  if (days < 0) {
    label = `FOC passed`;
    tone = "overdue";
  } else if (days === 0) {
    label = "FOC today";
    tone = "urgent";
  } else if (days === 1) {
    label = "FOC tomorrow";
    tone = "urgent";
  } else {
    label = `FOC in ${days} days`;
    tone = days <= 3 ? "urgent" : days <= 5 ? "soon" : "later";
  }
  return { days, label, tone };
}

export function formatPrice(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Wed Jul 8" */
export function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Wednesday, July 8, 2026" */
export function formatDateLong(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = parseISO(iso);
  const weekday = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ][d.getDay()];
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][d.getMonth()];
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

const FORMAT_LABELS: Record<string, string> = {
  single_issue: "Single",
  trade_paperback: "TP",
  hardcover: "HC",
  omnibus: "Omnibus",
  other: "Other",
};

export function formatBadge(format: string | null): string {
  if (!format) return "—";
  return FORMAT_LABELS[format] ?? format;
}
