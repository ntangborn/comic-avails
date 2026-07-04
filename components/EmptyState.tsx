export function EmptyState({
  title,
  hint,
  error,
}: {
  title: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
      <p className="text-lg font-medium text-foreground">{title}</p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
      {error && (
        <p className="mx-auto mt-4 max-w-lg break-words rounded bg-red-950/40 px-3 py-2 text-left font-mono text-xs text-red-300 ring-1 ring-red-900/50">
          {error}
        </p>
      )}
    </div>
  );
}
