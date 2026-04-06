/**
 * Step 2: Deduplicate March NDJSON files by streaming line by line.
 *
 * Since the export is sorted, duplicate rows are always adjacent.
 * Simply compares each line to the previous - if identical, skip it.
 * Only v2 rows are deduplicated (SDK rows are kept as-is regardless).
 *
 * Memory usage: O(1) - only holds one line in memory at a time.
 *
 * Usage: bun run scripts/firecrawl-march-dedup.ts [YYYY-MM-DD]
 * Run from: sirtenzin-autumn/server/tinybird/
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

const INPUT_DIR = join(process.cwd(), "march-export");
const OUTPUT_DIR = join(process.cwd(), "march-deduped");
const SUMMARY_FILE = join(OUTPUT_DIR, "dedup-summary.json");

await mkdir(OUTPUT_DIR, { recursive: true });

const dayFilter = process.argv[2] ?? null;

const { readdir } = await import("node:fs/promises");
let files = (await readdir(INPUT_DIR)).filter((f) => f.endsWith(".ndjson")).sort();
if (dayFilter) {
  files = files.filter((f) => f.includes(dayFilter));
  if (files.length === 0) { console.error(`No file found for: ${dayFilter}`); process.exit(1); }
}

console.log(`\n=== Firecrawl March 2026 - Deduplication (streaming) ===`);
console.log(`Files: ${files.length}${dayFilter ? ` (${dayFilter})` : ""}\n`);

type DaySummary = {
  day: string;
  rowsIn: number;
  rowsOut: number;
  dupesRemoved: number;
};

let allSummary: DaySummary[] = [];
try { allSummary = JSON.parse(await readFile(SUMMARY_FILE, "utf-8")); } catch { }

for (const file of files) {
  const day = file.replace("day-", "").replace(".ndjson", "");
  const inputPath = join(INPUT_DIR, file);
  const outputPath = join(OUTPUT_DIR, file);

  const fileSize = (await import("node:fs")).statSync(inputPath).size;
  const writeStream = createWriteStream(outputPath);
  const rl = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });

  let prevLine = "";
  let rowsIn = 0;
  let rowsOut = 0;
  let dupesRemoved = 0;
  let bytesRead = 0;
  const dayStart = Date.now();
  let lastLog = Date.now();
  const LOG_INTERVAL_MS = 5_000;

  for await (const line of rl) {
    if (!line) continue;
    rowsIn++;
    bytesRead += line.length + 1;

    if (line === prevLine) {
      dupesRemoved++;
      continue;
    }

    writeStream.write(line + "\n");
    rowsOut++;
    prevLine = line;

    // Progress log every 5s
    if (Date.now() - lastLog >= LOG_INTERVAL_MS) {
      const pct = ((bytesRead / fileSize) * 100).toFixed(1);
      const elapsedSec = (Date.now() - dayStart) / 1000;
      const etaSec = elapsedSec / (bytesRead / fileSize) - elapsedSec;
      const etaMin = (etaSec / 60).toFixed(1);
      const mbRead = (bytesRead / 1e6).toFixed(0);
      const mbTotal = (fileSize / 1e6).toFixed(0);
      console.log(`  [${day}] ${pct}% | ${mbRead}/${mbTotal}MB | ${rowsIn.toLocaleString()} in, ${rowsOut.toLocaleString()} out, ${dupesRemoved.toLocaleString()} dupes | ETA ~${etaMin}min`);
      lastLog = Date.now();
    }
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err: Error | null | undefined) => err ? reject(err) : resolve());
  });

  const totalSec = ((Date.now() - dayStart) / 1000).toFixed(1);
  console.log(`[${day}] DONE in ${totalSec}s | ${rowsIn.toLocaleString()} in → ${rowsOut.toLocaleString()} out | ${dupesRemoved.toLocaleString()} dupes removed`);

  const daySummary: DaySummary = { day, rowsIn, rowsOut, dupesRemoved };
  const idx = allSummary.findIndex((s) => s.day === day);
  if (idx >= 0) allSummary[idx] = daySummary; else allSummary.push(daySummary);
}

allSummary.sort((a, b) => a.day.localeCompare(b.day));
await writeFile(SUMMARY_FILE, JSON.stringify(allSummary, null, 2), "utf-8");

console.log(`\nSummary: ${SUMMARY_FILE}\n`);
