/**
 * Splits a deduped daily NDJSON file into per-hour files.
 * Streams line by line - O(1) memory.
 *
 * Usage: bun run scripts/firecrawl-split-hours.ts 2026-03-01
 * Run from: sirtenzin-autumn/server/tinybird/
 */

import { createReadStream, createWriteStream, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

const day = process.argv[2];
if (!day) { console.error("Usage: bun run scripts/firecrawl-split-hours.ts YYYY-MM-DD"); process.exit(1); }

const INPUT = join(process.cwd(), "march-deduped", `day-${day}.ndjson`);
const OUT_DIR = join(process.cwd(), "march-deduped-hours");

await mkdir(OUT_DIR, { recursive: true });

const fileSize = statSync(INPUT).size;
const fileSizeMB = (fileSize / 1e6).toFixed(0);

// Open all 24 write streams upfront
const streams: Record<string, ReturnType<typeof createWriteStream>> = {};
const counts: Record<string, number> = {};
for (let h = 0; h < 24; h++) {
  const hh = String(h).padStart(2, "0");
  streams[hh] = createWriteStream(join(OUT_DIR, `day-${day}-hour${hh}.ndjson`));
  counts[hh] = 0;
}

console.log(`\n=== Splitting ${day} into hourly files ===`);
console.log(`Input:  ${INPUT} (${fileSizeMB}MB)`);
console.log(`Output: ${OUT_DIR}\n`);

const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });

let total = 0;
let bytesRead = 0;
let skipped = 0;
const start = Date.now();
const LOG_EVERY = 250_000;

for await (const line of rl) {
  if (!line) continue;
  bytesRead += line.length + 1;
  total++;

  const m = line.match(/"timestamp":"(\d{4}-\d{2}-\d{2}) (\d{2}):/);
  if (!m) { skipped++; continue; }
  const hh = m[2];
  streams[hh]?.write(line + "\n");
  counts[hh]++;

  if (total % LOG_EVERY === 0) {
    const pct = ((bytesRead / fileSize) * 100).toFixed(1);
    const elapsedSec = (Date.now() - start) / 1000;
    const etaSec = (elapsedSec / (bytesRead / fileSize)) - elapsedSec;
    const etaMin = (etaSec / 60).toFixed(1);
    const mbRead = (bytesRead / 1e6).toFixed(0);
    const rowsPerSec = Math.round(total / elapsedSec);
    console.log(`  ${pct}% | ${mbRead}/${fileSizeMB}MB | ${total.toLocaleString()} rows | ${rowsPerSec.toLocaleString()} rows/s | ETA ~${etaMin}min`);
  }
}

// Close all streams
await Promise.all(Object.values(streams).map((s) => new Promise<void>((res, rej) => s.end((e: Error | null | undefined) => e ? rej(e) : res()))));

const totalSec = ((Date.now() - start) / 1000).toFixed(1);

console.log(`\n=== Done in ${totalSec}s ===`);
console.log(`Total rows: ${total.toLocaleString()} | Skipped: ${skipped}\n`);
console.log("Hour  Rows");
console.log("-".repeat(25));
for (let h = 0; h < 24; h++) {
  const hh = String(h).padStart(2, "0");
  console.log(`  ${hh}   ${counts[hh].toLocaleString()}`);
}
console.log("-".repeat(25));
console.log(`Total ${total.toLocaleString()}\n`);
