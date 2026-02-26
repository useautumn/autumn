#!/usr/bin/env bun

/**
 * Idempotent backfill script for customers from Postgres to Tinybird.
 *
 * Chunks by created_at epoch ms. Fills oldest → newest.
 * Safe to re-run — uses MAX(created_at) in Tinybird to find resume point.
 *
 * Usage:
 *   bun scripts/backfill_customers.ts
 *   bun scripts/backfill_customers.ts --chunk-days 30
 *   bun scripts/backfill_customers.ts --dry-run
 */

import { execSync } from "child_process";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Earliest possible customer (epoch ms). Adjust if needed.
const START_EPOCH_MS = 1706987055000;

// Latest epoch ms to backfill up to — set to "now" at runtime
const END_EPOCH_MS = Date.now();

const DEFAULT_CHUNK_DAYS = 30;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const DELAY_BETWEEN_CHUNKS_MS = 2000;

// ============================================================================
// TYPES
// ============================================================================

interface Args {
	chunkDays: number;
	dryRun: boolean;
}

interface Chunk {
	startEpochMs: number;
	endEpochMs: number;
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(): Args {
	const args: Args = {
		chunkDays: DEFAULT_CHUNK_DAYS,
		dryRun: false,
	};

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--chunk-days" && process.argv[i + 1]) {
			args.chunkDays = parseInt(process.argv[++i], 10);
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Idempotent backfill script for customers from Postgres to Tinybird

Usage: bun scripts/backfill_customers.ts [options]

Options:
  --chunk-days <n>   Days per chunk (default: ${DEFAULT_CHUNK_DAYS})
  --dry-run          Show what would be done without executing
  --help, -h         Show this help message
`);
			process.exit(0);
		}
	}

	return args;
}

// ============================================================================
// UTILITIES
// ============================================================================

function execCapture({ cmd }: { cmd: string }): string {
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		return error.stdout?.trim() ?? "";
	}	
}

function tbSql({ query }: { query: string }): string {
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

function exec({ cmd }: { cmd: string }): void {
	execSync(cmd, { encoding: "utf-8", stdio: "inherit" });
}

async function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractNumber({ result }: { result: string }): number | null {
	for (const line of result.split("\n")) {
		const cleaned = line.trim();
		const num = Number(cleaned);
		if (!isNaN(num) && cleaned !== "" && String(Math.round(num)) === cleaned) {
			return num;
		}
	}
	return null;
}

function formatEpochMs({ epochMs }: { epochMs: number }): string {
	return new Date(epochMs).toISOString();
}

// ============================================================================
// TINYBIRD QUERIES
// ============================================================================

function getMaxCreatedAtInTinybird(): number | null {
	console.log("Querying Tinybird for backfill progress...");
	const result = tbSql({
		query: "SELECT max(created_at) FROM customers WHERE __action = 'read'",
	});
	const num = extractNumber({ result });
	if (num && num > 0) {
		console.log(`  Tinybird MAX created_at (backfill rows): ${num} (${formatEpochMs({ epochMs: num })})`);
		return num;
	}
	console.log("  Tinybird MAX created_at: No backfilled rows yet");
	return null;
}

function getCustomerCount(): number {
	const result = tbSql({ query: "SELECT count() FROM customers FINAL WHERE __action != 'delete'" });
	return extractNumber({ result }) ?? 0;
}

// ============================================================================
// CHUNK GENERATION (FORWARD)
// ============================================================================

function generateChunksForward({
	startEpochMs,
	endEpochMs,
	chunkDays,
}: {
	startEpochMs: number;
	endEpochMs: number;
	chunkDays: number;
}): Chunk[] {
	const chunks: Chunk[] = [];
	const chunkMs = chunkDays * 24 * 60 * 60 * 1000;
	let current = startEpochMs;

	while (current < endEpochMs) {
		const next = Math.min(current + chunkMs, endEpochMs);
		chunks.push({ startEpochMs: current, endEpochMs: next });
		current = next;
	}

	return chunks;
}

// ============================================================================
// COPY JOB EXECUTION
// ============================================================================

async function waitForCopyJobs(): Promise<void> {
	const maxAttempts = 60;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const waiting = execCapture({
			cmd: "tb --cloud job ls --status waiting --kind copy 2>/dev/null | grep -c '^id:' || echo 0",
		});
		const working = execCapture({
			cmd: "tb --cloud job ls --status working --kind copy 2>/dev/null | grep -c '^id:' || echo 0",
		});
		const total = parseInt(waiting, 10) + parseInt(working, 10);

		if (total === 0) return;
		if (attempt === 0) console.log(`  Waiting for ${total} existing copy job(s) to complete...`);

		await sleep({ ms: 5000 });
	}

	throw new Error("Timed out waiting for existing copy jobs to complete");
}

async function runCopyJob({
	startEpochMs,
	endEpochMs,
	retries = MAX_RETRIES,
}: {
	startEpochMs: number;
	endEpochMs: number;
	retries?: number;
}): Promise<boolean> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await waitForCopyJobs();
			exec({
				cmd: `tb --cloud copy run customers_backfill --param start_epoch_ms="${startEpochMs}" --param end_epoch_ms="${endEpochMs}" --wait`,
			});
			return true;
		} catch (error: any) {
			const msg = error.message || error.toString();
			if (attempt < retries) {
				console.log(`  Attempt ${attempt}/${retries} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
				console.log(`  Error: ${msg.substring(0, 200)}`);
				await sleep({ ms: RETRY_DELAY_MS });
			} else {
				console.error(`  All ${retries} attempts failed for chunk ${startEpochMs} -> ${endEpochMs}`);
				console.error(`  Error: ${msg}`);
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
	console.log("=== Customers Backfill Script ===\n");

	const args = parseArgs();

	// 1. Find resume point from Tinybird
	const tinybirdMax = getMaxCreatedAtInTinybird();

	// Resume from just after the last backfilled row, or from the very beginning
	const resumePoint = tinybirdMax ? tinybirdMax + 1 : START_EPOCH_MS;
	const endPoint = END_EPOCH_MS;

	console.log(`\nResume point: ${resumePoint} (${formatEpochMs({ epochMs: resumePoint })})`);
	console.log(`End point:    ${endPoint} (${formatEpochMs({ epochMs: endPoint })})`);

	// 2. Check if done
	if (resumePoint >= endPoint) {
		console.log("\n✓ Backfill complete! Nothing more to do.");
		console.log(`  Total customers in Tinybird: ${getCustomerCount()}`);
		process.exit(0);
	}

	// 3. Generate chunks
	const chunks = generateChunksForward({
		startEpochMs: resumePoint,
		endEpochMs: endPoint,
		chunkDays: args.chunkDays,
	});

	console.log(`\nGenerated ${chunks.length} chunks (${args.chunkDays} days each)`);
	console.log(`Direction: oldest → newest\n`);

	// 4. Dry run
	if (args.dryRun) {
		console.log("DRY RUN - Would process these chunks:\n");
		chunks.forEach((chunk, i) => {
			console.log(
				`  ${i + 1}. ${formatEpochMs({ epochMs: chunk.startEpochMs })} -> ${formatEpochMs({ epochMs: chunk.endEpochMs })}`,
			);
		});
		console.log(`\nTotal: ${chunks.length} chunks`);
		process.exit(0);
	}

	// 5. Process chunks
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const chunkNum = i + 1;

		console.log(
			`=== Chunk ${chunkNum}/${chunks.length}: ${formatEpochMs({ epochMs: chunk.startEpochMs })} -> ${formatEpochMs({ epochMs: chunk.endEpochMs })} ===`,
		);

		const startTime = Date.now();
		const success = await runCopyJob({
			startEpochMs: chunk.startEpochMs,
			endEpochMs: chunk.endEpochMs,
		});
		const duration = Math.round((Date.now() - startTime) / 1000);

		if (success) {
			const count = getCustomerCount();
			console.log(`✓ Chunk ${chunkNum} COMPLETE in ${duration}s. Customers in Tinybird: ${count}\n`);
		} else {
			console.log(`✗ Chunk ${chunkNum} FAILED after ${duration}s\n`);
			console.log("To resume, simply re-run:");
			console.log("  bun scripts/backfill_customers.ts\n");
			process.exit(1);
		}

		if (i < chunks.length - 1) {
			await sleep({ ms: DELAY_BETWEEN_CHUNKS_MS });
		}
	}

	// 6. Summary
	console.log("==========================================");
	console.log("=== Backfill Complete ===");
	console.log(`Total customers in Tinybird: ${getCustomerCount()}`);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
