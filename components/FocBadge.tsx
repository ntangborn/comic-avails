import { focCountdown, type FocTone } from "@/lib/format";

const TONE_CLASSES: Record<FocTone, string> = {
  overdue: "bg-red-950/60 text-red-300 ring-1 ring-red-900/60",
  urgent: "bg-accent text-black font-semibold",
  soon: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30",
  later: "bg-surface-2 text-muted ring-1 ring-border",
};

export function FocBadge({
  foc,
  size = "md",
}: {
  foc: string | null;
  size?: "sm" | "md";
}) {
  const c = focCountdown(foc);
  if (!c) {
    return (
      <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted ring-1 ring-border">
        FOC TBD
      </span>
    );
  }
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md ${pad} ${TONE_CLASSES[c.tone]}`}
    >
      {c.label}
    </span>
  );
}
