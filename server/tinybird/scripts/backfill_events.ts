#!/usr/bin/env bun

/**
 * Idempotent backfill script for events from Postgres to Tinybird
 * 
 * Features:
 * - Auto-detects date range (first event in Postgres to today 00:00)
 * - Resumes from where it left off (no truncation needed)
 * - Configurable chunk size to avoid timeouts
 * - Retries failed chunks
 * - Optional truncation with --truncate flag
 * 
 * Usage:
 *   npx tsx scripts/backfill_events.ts
 *   npx tsx scripts/backfill_events.ts --chunk-hours 12
 *   npx tsx scripts/backfill_events.ts --start-date "2025-10-01 00:00:00"
 *   npx tsx scripts/backfill_events.ts --end-date "2026-01-28 00:00:00"
 *   npx tsx scripts/backfill_events.ts --truncate --start-date "2025-01-30 00:00:00"
 */

import { execSync } from "child_process";

// Configuration
const DEFAULT_CHUNK_HOURS = 24; // ~1 month (30 * 24)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const DELAY_BETWEEN_CHUNKS_MS = 3000;

interface Args {
  chunkHours: number;
  startDate?: string;
  endDate?: string;
  dryRun: boolean;
  truncate: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    chunkHours: DEFAULT_CHUNK_HOURS,
    dryRun: false,
    truncate: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--chunk-hours" && process.argv[i + 1]) {
      args.chunkHours = parseInt(process.argv[++i], 10);
    } else if (arg === "--start-date" && process.argv[i + 1]) {
      args.startDate = process.argv[++i];
    } else if (arg === "--end-date" && process.argv[i + 1]) {
      args.endDate = process.argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--truncate") {
      args.truncate = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: npx tsx scripts/backfill_events.ts [options]

Options:
  --chunk-hours <n>     Hours per chunk (default: ${DEFAULT_CHUNK_HOURS})
  --start-date <date>   Override start date (default: auto-detect from Tinybird)
  --end-date <date>     Override end date (default: today 00:00)
  --dry-run             Show what would be done without executing
  --truncate            Truncate the events datasource before backfilling (requires --start-date)
  --help, -h            Show this help message

Examples:
  npx tsx scripts/backfill_events.ts
  npx tsx scripts/backfill_events.ts --chunk-hours 12
  npx tsx scripts/backfill_events.ts --start-date "2025-10-01 00:00:00"
  npx tsx scripts/backfill_events.ts --truncate --start-date "2025-01-30 00:00:00"
`);
      process.exit(0);
    }
  }

  return args;
}

function exec(cmd: string, silent = false): string {
  try {
    const result = execSync(cmd, { encoding: "utf-8", stdio: silent ? "pipe" : "inherit" });
    return result?.trim() ?? "";
  } catch (error: any) {
    if (silent) {
      return error.stdout?.trim() ?? "";
    }
    throw error;
  }
}

function execCapture(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stderr: "pipe" }).trim();
  } catch (error: any) {
    return error.stdout?.trim() ?? "";
  }
}

function tbSql(query: string): string {
  const escaped = query.replace(/"/g, '\\"');
  try {
    const result = execSync(`tb --cloud sql "${escaped}"`, { 
      encoding: "utf-8", 
      stdio: ["pipe", "pipe", "pipe"] 
    });
    return result.trim();
  } catch (error: any) {
    return error.stdout?.trim() ?? "";
  }
}

function getLatestEventInTinybird(): string | null {
  console.log("Checking latest event in Tinybird...");
  const result = tbSql("SELECT max(timestamp) FROM events");
  // Table format - look for timestamp pattern YYYY-MM-DD HH:MM:SS
  const lines = result.split("\n");
  for (const line of lines) {
    const cleaned = line.trim();
    // Match timestamp format: 2026-01-28 12:34:56 or 2026-01-28 12:34:56.000000
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(cleaned)) {
      if (cleaned === "1970-01-01 00:00:00.000000" || cleaned === "1970-01-01 00:00:00") {
        return null;
      }
      return cleaned;
    }
  }
  return null;
}

function getEventCount(): number {
  const result = tbSql("SELECT count() FROM events");
  // Table format output:
  // Running against Tinybird Cloud: Workspace autumn_us_west_dev
  //   count()
  //    UInt64
  // ───────────
  //   3045881
  const lines = result.split("\n");
  for (const line of lines) {
    const cleaned = line.trim();
    // Look for a line that's just a number
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && String(num) === cleaned) {
      return num;
    }
  }
  return 0;
}

function truncateEvents(): void {
  console.log("Truncating events datasource...");
  exec("tb --cloud datasource truncate events --yes", false);
  console.log("Truncated.\n");
}

function promptConfirmation(message: string): boolean {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question(`${message} (y/n) `, (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  }) as unknown as boolean;
}

async function promptConfirmationAsync(message: string): Promise<boolean> {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question(`${message} (y/n) `, (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function getTodayMidnight(): string {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return formatDate(midnight);
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "").split(".")[0];
}

function parseDate(dateStr: string): Date {
  // Handle format: "2026-01-21 00:00:00" or "2026-01-21 00:00:00.000000"
  const cleaned = dateStr.split(".")[0].replace(" ", "T") + "Z";
  return new Date(cleaned);
}

function addHours(dateStr: string, hours: number): string {
  const date = parseDate(dateStr);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return formatDate(date);
}

function floorToHour(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setMinutes(0, 0, 0);
  return formatDate(date);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCopyJobs(): Promise<void> {
  const maxAttempts = 60;
  let attempt = 0;

  while (attempt < maxAttempts) {
    const waitingJobs = execCapture("tb --cloud job ls --status waiting --kind copy 2>/dev/null | grep -c '^id:' || echo 0");
    const workingJobs = execCapture("tb --cloud job ls --status working --kind copy 2>/dev/null | grep -c '^id:' || echo 0");
    const total = parseInt(waitingJobs, 10) + parseInt(workingJobs, 10);

    if (total === 0) {
      return;
    }

    if (attempt === 0) {
      console.log(`  Waiting for ${total} existing copy job(s) to complete...`);
    }

    await sleep(5000);
    attempt++;
  }

  throw new Error("Timed out waiting for existing copy jobs to complete");
}

async function runCopyJob(startDate: string, endDate: string, retries = MAX_RETRIES): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await waitForCopyJobs();
      
      exec(
        `tb --cloud copy run events_backfill --param start_date="${startDate}" --param end_date="${endDate}" --wait`,
        false
      );
      return true;
    } catch (error: any) {
      const errorMsg = error.message || error.toString();
      
      if (attempt < retries) {
        console.log(`  Attempt ${attempt}/${retries} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        console.log(`  Error: ${errorMsg.substring(0, 200)}`);
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error(`  All ${retries} attempts failed for chunk ${startDate} -> ${endDate}`);
        console.error(`  Error: ${errorMsg}`);
        return false;
      }
    }
  }
  return false;
}

interface Chunk {
  start: string;
  end: string;
}

function generateChunks(startDate: string, endDate: string, chunkHours: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current = startDate;

  while (parseDate(current) < parseDate(endDate)) {
    let next = addHours(current, chunkHours);
    
    if (parseDate(next) > parseDate(endDate)) {
      next = endDate;
    }

    chunks.push({ start: current, end: next });
    current = next;
  }

  return chunks;
}

async function main() {
  console.log("=== Events Backfill Script (TypeScript) ===\n");

  const args = parseArgs();

  // Handle truncation
  if (args.truncate) {
    if (!args.startDate) {
      console.error("Error: --truncate requires --start-date to be specified.");
      console.error("This prevents accidentally truncating without knowing where to start.");
      process.exit(1);
    }

    const currentCount = getEventCount();
    console.log(`Current event count: ${currentCount}`);
    
    const confirmed = await promptConfirmationAsync(
      `This will TRUNCATE all ${currentCount} events. Are you sure?`
    );
    
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(0);
    }

    truncateEvents();
  }

  // Determine end date (today 00:00 UTC)
  const endDate = args.endDate ?? getTodayMidnight();
  console.log(`End date: ${endDate}`);

  // Determine start date (from latest event in Tinybird, or from args)
  let startDate: string;
  
  if (args.startDate) {
    startDate = args.startDate;
    console.log(`Start date (from args): ${startDate}`);
  } else {
    const latestInTinybird = getLatestEventInTinybird();
    
    if (latestInTinybird) {
      // Resume from after the latest event (floor to hour boundary)
      startDate = floorToHour(latestInTinybird);
      console.log(`Resuming from latest event in Tinybird: ${latestInTinybird}`);
      console.log(`Start date (floored to hour): ${startDate}`);
    } else {
      console.error("No events in Tinybird and no --start-date provided.");
      console.error("Please provide --start-date to specify where to start backfilling from.");
      console.error("\nTo find the first event in your source database, run:");
      console.error("  SELECT min(timestamp) FROM events");
      process.exit(1);
    }
  }

  // Validate dates
  if (parseDate(startDate) >= parseDate(endDate)) {
    console.log("\nNothing to backfill - start date is >= end date.");
    console.log(`Current event count: ${getEventCount()}`);
    process.exit(0);
  }

  // Generate chunks
  const chunks = generateChunks(startDate, endDate, args.chunkHours);
  console.log(`\nGenerated ${chunks.length} chunks (${args.chunkHours}h each)`);
  console.log(`Range: ${startDate} -> ${endDate}\n`);

  if (args.dryRun) {
    console.log("DRY RUN - Would process these chunks:\n");
    chunks.forEach((chunk, i) => {
      console.log(`  ${i + 1}. ${chunk.start} -> ${chunk.end}`);
    });
    process.exit(0);
  }

  // Process chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNum = i + 1;

    console.log(`=== Chunk ${chunkNum}/${chunks.length}: ${chunk.start} -> ${chunk.end} ===`);

    const startTime = Date.now();
    const success = await runCopyJob(chunk.start, chunk.end);
    const duration = Math.round((Date.now() - startTime) / 1000);

    if (success) {
      const rowCount = getEventCount();
      console.log(`✓ Chunk ${chunkNum} COMPLETE in ${duration}s. Total rows: ${rowCount}\n`);
    } else {
      console.log(`✗ Chunk ${chunkNum} FAILED after ${duration}s\n`);
      console.log(`To resume, run:`);
      console.log(`  bun scripts/backfill_events.ts\n`);
      process.exit(1);  // Stop immediately - don't skip chunks
    }

    // Delay between chunks (unless it's the last one)
    if (i < chunks.length - 1) {
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  // Summary
  console.log("==========================================");
  console.log("=== Backfill Complete ===");
  console.log(`Final row count: ${getEventCount()}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
