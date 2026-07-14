/**
 * scripts/ingest.ts
 *
 * Generic, registry-driven solicitation ingest — works for every publisher in
 * scripts/lib/sources.ts (resolves build-guide decision P1 toward a single
 * generic entry rather than one script per publisher).
 *
 *   npx tsx scripts/ingest.ts <slug> [url]
 *
 *   npx tsx scripts/ingest.ts marvel
 *   npx tsx scripts/ingest.ts image
 *   npx tsx scripts/ingest.ts dc https://.../dc-october-2026-solicitations/
 *   npx tsx scripts/ingest.ts --list          # show known slugs + current URLs
 *
 * With no <url>, the current known-good URL from the registry is used. Pass an
 * explicit <url> to override (e.g. next month's post before the registry is
 * refreshed). Heed `verified: false` / coverage-gap notes in the registry.
 */

import {
  SOLICIT_SOURCES,
  sourceForSlug,
  type SolicitSource,
} from "./lib/sources";
import { loadEnv, runIngest, printSummary } from "./lib/ingest-core";

function listSources(): void {
  console.log("Known publishers (slug — month — verified — url):\n");
  for (const s of SOLICIT_SOURCES) {
    const flag = s.current.verified ? "✓" : "⚠ UNVERIFIED";
    console.log(`  ${s.slug.padEnd(14)} ${s.current.month}  ${flag}`);
    console.log(`      ${s.current.url}`);
    if (s.notes) console.log(`      note: ${s.notes}`);
  }
}

async function main(): Promise<void> {
  loadEnv();

  // --no-prune keeps stale rows (skip the post-upsert reconcile).
  const argv = process.argv.slice(2);
  const prune = !argv.includes("--no-prune");
  const positional = argv.filter((a) => !a.startsWith("--"));

  const arg = positional[0];
  if (!arg || arg === "-l" || argv.includes("--list")) {
    if (!arg) {
      console.error("Usage: npx tsx scripts/ingest.ts <slug> [url] [--no-prune]\n");
    }
    listSources();
    if (!arg) process.exitCode = 1;
    return;
  }

  const slug = arg;
  const source: SolicitSource | undefined = sourceForSlug(slug);
  if (!source) {
    console.error(
      `Unknown publisher slug: '${slug}'. Run with --list to see known slugs.`,
    );
    process.exitCode = 1;
    return;
  }

  const url = positional[1] ?? source.current.url;
  if (!positional[1]) {
    if (!source.current.verified) {
      console.warn(
        `⚠ Registry URL for '${slug}' is UNVERIFIED — confirm it resolves before trusting the run.`,
      );
    }
    if (source.notes) console.log(`Note: ${source.notes}\n`);
    console.log(`Using registry URL (${source.current.month}):\n  ${url}\n`);
  }
  if (!prune) console.log("(--no-prune: keeping stale rows)\n");

  const result = await runIngest({
    slug,
    publisher: source.publisher,
    url,
    prune,
  });
  printSummary(source.publisher, result);
}

main().catch((err) => {
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
