#!/usr/bin/env bun

/**
 * Idempotent DOWNWARD backfill script for events from Postgres to Tinybird
 *
 * Features:
 * - Backfills events BEFORE the cutoff date (when dual-write started)
 * - Fills downward: newest → oldest (today → yesterday → etc.)
 * - 100% idempotent: queries Tinybird MIN to find resume point
 * - Can be safely re-run with different chunk sizes
 * - Retries failed chunks
 *
 * Usage:
 *   bun scripts/backfill_events.ts
 *   bun scripts/backfill_events.ts --chunk-hours 12
 *   bun scripts/backfill_events.ts --dry-run
 *   bun scripts/backfill_events.ts --start-date "2025-06-15 00:00:00"
 */

import { execSync } from "child_process";

// ============================================================================
// CONFIGURATION
// ============================================================================

// CUTOFF: The earliest event timestamp in Tinybird from dual-write.
// We backfill everything BEFORE this date. Do not modify unless you know what you're doing.
const CUTOFF_DATE = "2026-01-30 10:30:00";

// TARGET: The oldest event in Postgres. Backfill stops here.
const TARGET_DATE = "2025-01-30 00:00:00";

const DEFAULT_CHUNK_HOURS = 24 * 7;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const DELAY_BETWEEN_CHUNKS_MS = 3000;

// ============================================================================
// TYPES
// ============================================================================

interface Args {
	chunkHours: number;
	startDate?: string; // Override: oldest date to backfill to
	dryRun: boolean;
}

interface Chunk {
	start: string;
	end: string;
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(): Args {
	const args: Args = {
		chunkHours: DEFAULT_CHUNK_HOURS,
		dryRun: false,
	};

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--chunk-hours" && process.argv[i + 1]) {
			args.chunkHours = parseInt(process.argv[++i], 10);
		} else if (arg === "--start-date" && process.argv[i + 1]) {
			args.startDate = process.argv[++i];
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Idempotent DOWNWARD backfill script for events from Postgres to Tinybird

Usage: bun scripts/backfill_events.ts [options]

Options:
  --chunk-hours <n>     Hours per chunk (default: ${DEFAULT_CHUNK_HOURS})
  --start-date <date>   Override end point (oldest date to backfill to)
  --dry-run             Show what would be done without executing
  --help, -h            Show this help message

How it works:
  1. Queries Postgres for MIN(timestamp) - the oldest event (our target)
  2. Queries Tinybird for MIN(timestamp) below cutoff - our current progress
  3. Generates chunks from resume point DOWN to target
  4. Processes chunks in reverse chronological order

Idempotency:
  - Safe to re-run at any time
  - Safe to change chunk size between runs
  - Automatically resumes from where it left off

Examples:
  bun scripts/backfill_events.ts
  bun scripts/backfill_events.ts --chunk-hours 12
  bun scripts/backfill_events.ts --dry-run
`);
			process.exit(0);
		}
	}

	return args;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function exec(cmd: string, silent = false): string {
	try {
		const result = execSync(cmd, {
			encoding: "utf-8",
			stdio: silent ? "pipe" : "inherit",
		});
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
			stdio: ["pipe", "pipe", "pipe"],
		});
		return result.trim();
	} catch (error: any) {
		return error.stdout?.trim() ?? "";
	}
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
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTimestamp(result: string): string | null {
	const lines = result.split("\n");
	for (const line of lines) {
		const cleaned = line.trim();
		// Match timestamp format: 2026-01-28 12:34:56 or 2026-01-28 12:34:56.000000
		if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(cleaned)) {
			if (
				cleaned === "1970-01-01 00:00:00.000000" ||
				cleaned === "1970-01-01 00:00:00"
			) {
				return null;
			}
			return cleaned;
		}
	}
	return null;
}

// ============================================================================
// TINYBIRD QUERIES
// ============================================================================

function getMinTimestampInTinybird(): string | null {
	console.log("Querying Tinybird for backfill progress...");
	const result = tbSql(
		`SELECT min(timestamp) FROM events WHERE timestamp < '${CUTOFF_DATE}'`,
	);
	const timestamp = extractTimestamp(result);
	if (timestamp) {
		console.log(`  Tinybird MIN (below cutoff): ${timestamp}`);
	} else {
		console.log("  Tinybird MIN (below cutoff): No backfilled events yet");
	}
	return timestamp;
}

function getEventCount(): number {
	const result = tbSql("SELECT count() FROM events");
	const lines = result.split("\n");
	for (const line of lines) {
		const cleaned = line.trim();
		const num = parseInt(cleaned, 10);
		if (!isNaN(num) && String(num) === cleaned) {
			return num;
		}
	}
	return 0;
}

function getBackfilledEventCount(): number {
	const result = tbSql(
		`SELECT count() FROM events WHERE timestamp < '${CUTOFF_DATE}'`,
	);
	const lines = result.split("\n");
	for (const line of lines) {
		const cleaned = line.trim();
		const num = parseInt(cleaned, 10);
		if (!isNaN(num) && String(num) === cleaned) {
			return num;
		}
	}
	return 0;
}

// ============================================================================
// CHUNK GENERATION (DOWNWARD)
// ============================================================================

function generateChunksDownward(
	resumePoint: string,
	endPoint: string,
	chunkHours: number,
): Chunk[] {
	const chunks: Chunk[] = [];
	let current = resumePoint;

	// Generate chunks going backwards in time
	while (parseDate(current) > parseDate(endPoint)) {
		let prev = addHours(current, -chunkHours);

		// Don't go past the end point
		if (parseDate(prev) < parseDate(endPoint)) {
			prev = endPoint;
		}

		chunks.push({ start: prev, end: current });
		current = prev;
	}

	return chunks;
}

// ============================================================================
// COPY JOB EXECUTION
// ============================================================================

async function waitForCopyJobs(): Promise<void> {
	const maxAttempts = 60;
	let attempt = 0;

	while (attempt < maxAttempts) {
		const waitingJobs = execCapture(
			"tb --cloud job ls --status waiting --kind copy 2>/dev/null | grep -c '^id:' || echo 0",
		);
		const workingJobs = execCapture(
			"tb --cloud job ls --status working --kind copy 2>/dev/null | grep -c '^id:' || echo 0",
		);
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

async function runCopyJob(
	startDate: string,
	endDate: string,
	retries = MAX_RETRIES,
): Promise<boolean> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await waitForCopyJobs();

			exec(
				`tb --cloud copy run events_backfill --param start_date="${startDate}" --param end_date="${endDate}" --wait`,
				false,
			);
			return true;
		} catch (error: any) {
			const errorMsg = error.message || error.toString();

			if (attempt < retries) {
				console.log(
					`  Attempt ${attempt}/${retries} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
				);
				console.log(`  Error: ${errorMsg.substring(0, 200)}`);
				await sleep(RETRY_DELAY_MS);
			} else {
				console.error(
					`  All ${retries} attempts failed for chunk ${startDate} -> ${endDate}`,
				);
				console.error(`  Error: ${errorMsg}`);
				return false;
			}
		}
	}
	return false;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	console.log("=== Events Backfill Script (Downward Fill) ===\n");
	console.log(`Cutoff date (hardcoded): ${CUTOFF_DATE}`);
	console.log("Events >= cutoff are from live dual-write and will NOT be touched.\n");

	const args = parseArgs();

	// 1. Get the oldest event in Postgres (our target)
	const postgresMin = args.startDate ?? TARGET_DATE;
	console.log(`Target date (hardcoded): ${TARGET_DATE}\n`);

	// 2. Get the current backfill progress from Tinybird
	const tinybirdMin = getMinTimestampInTinybird();

	// 3. Determine resume point
	// If no backfilled events yet, start from cutoff
	// Otherwise, resume from where we left off (Tinybird MIN)
	const resumePoint = tinybirdMin ? floorToHour(tinybirdMin) : CUTOFF_DATE;

	console.log(`\nResume point: ${resumePoint}`);
	console.log(`Target (oldest): ${postgresMin}`);

	// 4. Check if done
	if (parseDate(resumePoint) <= parseDate(postgresMin)) {
		console.log("\n✓ Backfill complete! Nothing more to do.");
		console.log(`  Total events: ${getEventCount()}`);
		console.log(`  Backfilled events (below cutoff): ${getBackfilledEventCount()}`);
		process.exit(0);
	}

	// 5. Generate chunks (downward)
	const chunks = generateChunksDownward(resumePoint, postgresMin, args.chunkHours);
	console.log(`\nGenerated ${chunks.length} chunks (${args.chunkHours}h each)`);
	console.log(`Direction: ${resumePoint} ↓ ${postgresMin}\n`);

	// 6. Dry run - show chunks and exit
	if (args.dryRun) {
		console.log("DRY RUN - Would process these chunks:\n");
		chunks.forEach((chunk, i) => {
			console.log(`  ${i + 1}. ${chunk.start} -> ${chunk.end}`);
		});
		console.log(`\nTotal: ${chunks.length} chunks`);
		process.exit(0);
	}

	// 7. Process chunks
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const chunkNum = i + 1;

		console.log(
			`=== Chunk ${chunkNum}/${chunks.length}: ${chunk.start} -> ${chunk.end} ===`,
		);

		const startTime = Date.now();
		const success = await runCopyJob(chunk.start, chunk.end);
		const duration = Math.round((Date.now() - startTime) / 1000);

		if (success) {
			const rowCount = getEventCount();
			const backfilledCount = getBackfilledEventCount();
			console.log(
				`✓ Chunk ${chunkNum} COMPLETE in ${duration}s. Total: ${rowCount} | Backfilled: ${backfilledCount}\n`,
			);
		} else {
			console.log(`✗ Chunk ${chunkNum} FAILED after ${duration}s\n`);
			console.log(`To resume, simply re-run:`);
			console.log(`  bun scripts/backfill_events.ts\n`);
			process.exit(1);
		}

		// Delay between chunks (unless it's the last one)
		if (i < chunks.length - 1) {
			await sleep(DELAY_BETWEEN_CHUNKS_MS);
		}
	}

	// 8. Summary
	console.log("==========================================");
	console.log("=== Backfill Complete ===");
	console.log(`Total events: ${getEventCount()}`);
	console.log(`Backfilled events (below cutoff): ${getBackfilledEventCount()}`);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
