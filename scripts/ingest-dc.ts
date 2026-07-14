/**
 * scripts/ingest-dc.ts
 *
 * DC-specific convenience wrapper. The pipeline now lives in
 * scripts/lib/ingest-core.ts and the generic entry point is
 * scripts/ingest.ts (`npx tsx scripts/ingest.ts dc`). This wrapper is kept for
 * backward compatibility with earlier handoff docs.
 *
 *   npx tsx scripts/ingest-dc.ts [url]
 *
 * With no <url>, the current known-good DC URL from the registry is used.
 */

import { sourceForSlug } from "./lib/sources";
import { loadEnv, runIngest, printSummary } from "./lib/ingest-core";

async function main(): Promise<void> {
  loadEnv();

  const dc = sourceForSlug("dc");
  if (!dc) throw new Error("DC not found in the solicit source registry.");

  const argv = process.argv.slice(2);
  const prune = !argv.includes("--no-prune");
  const url = argv.find((a) => !a.startsWith("--")) ?? dc.current.url;
  if (url === dc.current.url) {
    console.log(`No URL argument given — using registry URL:\n  ${url}\n`);
  }

  const result = await runIngest({
    slug: "dc",
    publisher: dc.publisher,
    url,
    prune,
  });
  printSummary(dc.publisher, result);
}

main().catch((err) => {
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
