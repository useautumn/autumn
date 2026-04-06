/**
 * Step 3: Replace March 2026 events in Tinybird hour by hour, 10-min chunk by chunk.
 *
 * For each hourly file in ./march-deduped-hours/:
 *   - Splits into 10-minute chunk files (~60MB each, under Tinybird's 100MB limit)
 *   - Runs `tb --cloud datasource replace events` for each chunk
 *   - Writes a checkpoint so it's resumable
 *
 * Usage: bun run scripts/firecrawl-march-replace.ts [YYYY-MM-DD] [HH]
 *   e.g: bun run scripts/firecrawl-march-replace.ts 2026-03-01
 *        bun run scripts/firecrawl-march-replace.ts 2026-03-01 01
 * Run from: sirtenzin-autumn/server/tinybird/
 */

import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ORG_ID = "biu9vSF7vghBLSKW1UTDwxHBAivjnPaK";
const HOURS_DIR = join(process.cwd(), "march-deduped-hours");
const CHUNKS_DIR = join(process.cwd(), "march-replace-chunks");
const CHECKPOINT_FILE = join(process.cwd(), "march-replace-checkpoint.json");
const TB_CWD = process.cwd();

const dayFilter = process.argv[2] ?? null;
const hourFilter = process.argv[3] ?? null;

if (!dayFilter) {
  console.error("Usage: bun run scripts/firecrawl-march-replace.ts YYYY-MM-DD [HH]");
  process.exit(1);
}

await mkdir(CHUNKS_DIR, { recursive: true });

// ── Checkpoint ────────────────────────────────────────────────────────────────
type Checkpoint = Record<string, "done" | "partial">;
let checkpoint: Checkpoint = {};
try { checkpoint = JSON.parse(await readFile(CHECKPOINT_FILE, "utf-8")); } catch { }
const saveCheckpoint = async () => writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), "utf-8");

// ── Helpers ───────────────────────────────────────────────────────────────────
const CHUNK_MINUTES = [0, 10, 20, 30, 40, 50];

const chunkKey = (day: string, hh: string, startMin: number) => `${day}-${hh}-${startMin}`;

const splitHourToChunks = async ({ day, hh, inputPath }: { day: string; hh: string; inputPath: string }) => {
  const fileSize = statSync(inputPath).size;
  const streams: Record<number, ReturnType<typeof createWriteStream>> = {};
  const counts: Record<number, number> = {};
  const paths: Record<number, string> = {};

  for (const m of CHUNK_MINUTES) {
    const p = join(CHUNKS_DIR, `${day}-hour${hh}-chunk${m}.ndjson`);
    streams[m] = createWriteStream(p);
    counts[m] = 0;
    paths[m] = p;
  }

  const rl = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
  let total = 0;
  let bytesRead = 0;
  const start = Date.now();

  for await (const line of rl) {
    if (!line) continue;
    bytesRead += line.length + 1;
    total++;

    const m = line.match(/"timestamp":"[^"]+? \d{2}:(\d{2}):/);
    if (!m) continue;
    const mins = parseInt(m[1]);
    const chunkMin = CHUNK_MINUTES.filter((c) => c <= mins).at(-1) ?? 0;
    streams[chunkMin].write(line + "\n");
    counts[chunkMin]++;

    if (total % 100_000 === 0) {
      const pct = ((bytesRead / fileSize) * 100).toFixed(1);
      const eta = (((Date.now() - start) / (bytesRead / fileSize) - (Date.now() - start)) / 1000 / 60).toFixed(1);
      process.stdout.write(`\r  splitting ${day} ${hh}:xx | ${pct}% | ${total.toLocaleString()} rows | ETA ~${eta}min  `);
    }
  }

  await Promise.all(Object.values(streams).map((s) => new Promise<void>((res, rej) => s.end((e: Error | null | undefined) => e ? rej(e) : res()))));
  process.stdout.write("\n");

  return { counts, paths, total };
};

const runReplace = ({ day, hh, startMin, filePath }: { day: string; hh: string; startMin: number; filePath: string }): boolean => {
  const endMin = startMin + 9;
  const tsStart = `${day} ${hh}:${String(startMin).padStart(2, "0")}:00`;
  const tsEnd = `${day} ${hh}:${String(endMin).padStart(2, "0")}:59`;
  const condition = `toYYYYMM(timestamp) = 202603 AND timestamp >= '${tsStart}' AND timestamp <= '${tsEnd}' AND org_id = '${ORG_ID}'`;

  const sizeMB = (statSync(filePath).size / 1e6).toFixed(1);
  process.stdout.write(`  replacing ${day} ${hh}:${String(startMin).padStart(2, "0")}-${String(endMin).padStart(2, "0")} (${sizeMB}MB)... `);

  const result = spawnSync(
    "tb",
    ["--cloud", "datasource", "replace", "events", filePath, "--sql-condition", condition],
    { encoding: "utf-8", timeout: 300_000, cwd: TB_CWD },
  );

  const output = (result.stdout ?? "") + (result.stderr ?? "");
  if (result.status !== 0 || output.toLowerCase().includes("error")) {
    console.log(`FAILED`);
    console.error(`  Error: ${output.slice(0, 300)}`);
    return false;
  }

  console.log(`OK`);
  return true;
};

// ── Main ──────────────────────────────────────────────────────────────────────
const hours = hourFilter ? [hourFilter] : Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const scriptStart = Date.now();
let totalChunksDone = 0;
let totalChunksSkipped = 0;
let totalFailed = 0;
const TOTAL_CHUNKS = hours.length * 6;

console.log(`\n=== Firecrawl March Replace: ${dayFilter} ${hourFilter ? `hour ${hourFilter}` : "all hours"} ===`);
console.log(`Chunks dir: ${CHUNKS_DIR}`);
console.log(`Checkpoint: ${CHECKPOINT_FILE}\n`);

for (const hh of hours) {
  const inputPath = join(HOURS_DIR, `day-${dayFilter}-hour${hh}.ndjson`);
  if (!existsSync(inputPath)) {
    console.log(`[${dayFilter} ${hh}:xx] No file found, skipping`);
    continue;
  }

  // Check if all chunks for this hour are already done
  const allDone = CHUNK_MINUTES.every((m) => checkpoint[chunkKey(dayFilter, hh, m)] === "done");
  if (allDone) {
    console.log(`[${dayFilter} ${hh}:xx] All chunks already done, skipping`);
    totalChunksSkipped += 6;
    continue;
  }

  console.log(`\n[${dayFilter} ${hh}:xx] Splitting into 10-min chunks...`);
  const { counts, paths } = await splitHourToChunks({ day: dayFilter, hh, inputPath });

  for (const startMin of CHUNK_MINUTES) {
    const key = chunkKey(dayFilter, hh, startMin);
    if (checkpoint[key] === "done") {
      console.log(`  chunk ${hh}:${String(startMin).padStart(2, "0")} already done, skipping`);
      totalChunksSkipped++;
      continue;
    }

    const filePath = paths[startMin];
    const rowCount = counts[startMin];

    if (rowCount === 0) {
      console.log(`  chunk ${hh}:${String(startMin).padStart(2, "0")}-${String(startMin + 9).padStart(2, "0")} empty, skipping`);
      checkpoint[key] = "done";
      await saveCheckpoint();
      totalChunksSkipped++;
      continue;
    }

    const ok = runReplace({ day: dayFilter, hh, startMin, filePath });
    if (ok) {
      checkpoint[key] = "done";
      await saveCheckpoint();
      totalChunksDone++;
      await rm(filePath, { force: true });
    } else {
      totalFailed++;
    }

    // ETA
    const elapsed = (Date.now() - scriptStart) / 1000;
    const done = totalChunksDone + totalChunksSkipped;
    const avg = elapsed / Math.max(1, totalChunksDone);
    const remaining = TOTAL_CHUNKS - done;
    const etaMin = ((remaining * avg) / 60).toFixed(0);
    console.log(`  Progress: ${done}/${TOTAL_CHUNKS} chunks | ${totalFailed} failed | ETA ~${etaMin}min`);
  }
}

const totalSec = ((Date.now() - scriptStart) / 1000).toFixed(1);
console.log(`\n=== Replace complete in ${totalSec}s ===`);
console.log(`Done: ${totalChunksDone} | Skipped: ${totalChunksSkipped} | Failed: ${totalFailed}\n`);
if (totalFailed > 0) console.log("Re-run the script to retry failed chunks (checkpoint will skip completed ones).");
