#!/usr/bin/env bun

/**
 * Idempotent DOWNWARD backfill for events_deductions_hourly_mv.
 *
 * The MV deploys with BACKFILL skip (the deploy-time repopulate decodes the
 * deductions JSON over ALL of `events` in one query and blows the deployment
 * cap), so history is filled here in bounded chunks via the
 * events_deductions_hourly_mv_backfill copy pipe on on-demand compute.
 *
 * - Fills downward: seam → yesterday → ... → target
 * - Idempotent: resumes from min(hour) in the MV. The first forward-materialized
 *   bucket IS the seam, so no hardcoded cutoff — but it means the MV must have
 *   at least one forward row before the first run (else there is no seam to
 *   fill below, and the script refuses rather than guess).
 * - All-time by default: custom_range is unbounded so any date can be queried.
 *   TARGET_DATE sits before the first deduction was ever written (~May 2026),
 *   so earlier windows would copy zero rows by construction anyway.
 *
 * Usage:
 *   bun scripts/backfill_deductions_mv.ts
 *   bun scripts/backfill_deductions_mv.ts --chunk-hours 12
 *   bun scripts/backfill_deductions_mv.ts --target-date "2025-06-01 00:00:00"
 *   bun scripts/backfill_deductions_mv.ts --dry-run
 */

import { execSync } from "child_process";

// ============================================================================
// CONFIGURATION
// ============================================================================

const COPY_PIPE = "events_deductions_hourly_mv_backfill";
const DATASOURCE = "events_deductions_hourly_mv";

// Before the first deduction was ever written to events. Earlier windows copy
// zero rows by construction — this is a data-existence floor, NOT a serving
// window: custom_range queries are unbounded. Override with --target-date if
// deductions ever get backfilled onto older events.
const TARGET_DATE = "2026-04-01 00:00:00";

// The deductions ARRAY JOIN fans out and pays a double JSONExtract per field,
// so default chunks are a day, not the wide chunks the no-fan-out backfills use.
const DEFAULT_CHUNK_HOURS = 24;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const DELAY_BETWEEN_CHUNKS_MS = 2000;

// ============================================================================
// TYPES / ARGS
// ============================================================================

interface Args {
	chunkHours: number;
	targetDate: string;
	dryRun: boolean;
}

interface Chunk {
	start: string;
	end: string;
}

function parseArgs(): Args {
	const args: Args = {
		chunkHours: DEFAULT_CHUNK_HOURS,
		targetDate: TARGET_DATE,
		dryRun: false,
	};

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--chunk-hours" && process.argv[i + 1]) {
			args.chunkHours = parseInt(process.argv[++i], 10);
			if (!Number.isInteger(args.chunkHours) || args.chunkHours <= 0) {
				console.error("--chunk-hours must be a positive integer");
				process.exit(1);
			}
		} else if (arg === "--target-date" && process.argv[i + 1]) {
			args.targetDate = process.argv[++i];
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Idempotent DOWNWARD backfill for ${DATASOURCE}

Options:
  --chunk-hours <n>     Hours per chunk (default: ${DEFAULT_CHUNK_HOURS})
  --target-date <date>  Oldest date to backfill to (default: ${TARGET_DATE},
                        before the first deduction was ever written)
  --dry-run             Show the chunks without running anything

How it works:
  1. Derives the EXACT seam live, no flags: take the earliest MV bucket
     H = min(hour), read how many deduction rows the MV holds for it, then
     find the min timestamp of the LAST that-many deduction rows in raw
     events for that hour — the precise point forward materialization took
     over. Anything before it was inserted pre-promote and needs backfilling.
     Once a bucket has been backfilled it is complete, so the derived seam
     collapses to exactly H and continuation runs resume hour-aligned.
  2. Generates [start, end) chunks from there DOWN to the target. Chunks
     need no hour alignment: the read pipes re-sum per bucket, so a
     backfilled partial hour and a forward-materialized partial hour add up.
  3. Runs each through 'tb --cloud copy run ${COPY_PIPE} --on-demand-compute'.

Safe to re-run at any time, safe to change chunk size between runs.
`);
			process.exit(0);
		}
	}

	return args;
}

// ============================================================================
// UTILITIES
// ============================================================================

// stdin is ALWAYS ignored: with it piped, any interactive tb prompt (workspace,
// auth, region) renders invisibly and the script hangs forever. Ignored, the
// prompt read fails and the error surfaces instead. Queries also carry a
// timeout for the same reason; copy runs don't (chunks legitimately run long).
const QUERY_TIMEOUT_MS = 300_000;

function exec(cmd: string, silent = false): string {
	try {
		const result = execSync(cmd, {
			encoding: "utf-8",
			stdio: silent ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
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
		return execSync(cmd, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: QUERY_TIMEOUT_MS,
		}).trim();
	} catch (error: any) {
		return error.stdout?.trim() ?? "";
	}
}

function tbSql(query: string): string {
	const escaped = query.replace(/"/g, '\\"');
	try {
		return execSync(`tb --cloud sql "${escaped}"`, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: QUERY_TIMEOUT_MS,
		}).trim();
	} catch (error: any) {
		if (error.signal === "SIGTERM") {
			console.error(
				`  tb sql timed out after ${QUERY_TIMEOUT_MS / 1000}s — is TINYBIRD_API_URL set and tb authenticated?`,
			);
		}
		return error.stdout?.trim() ?? "";
	}
}

function formatDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace("Z", "").split(".")[0];
}

function parseDate(dateStr: string): Date {
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
	for (const line of result.split("\n")) {
		const cleaned = line.trim();
		if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(cleaned)) {
			if (cleaned.startsWith("1970-01-01")) {
				return null;
			}
			return cleaned;
		}
	}
	return null;
}

function extractCount(result: string): number {
	for (const line of result.split("\n")) {
		const cleaned = line.trim();
		const num = parseInt(cleaned, 10);
		if (!isNaN(num) && String(num) === cleaned) {
			return num;
		}
	}
	return 0;
}

// ============================================================================
// TINYBIRD QUERIES
// ============================================================================

/** Seam on the first run, resume point on every later one. */
function getMinHour(): string | null {
	console.log("Querying the MV for backfill progress...");
	const timestamp = extractTimestamp(
		tbSql(`SELECT min(hour) FROM ${DATASOURCE}`),
	);
	console.log(
		timestamp
			? `  MV min(hour): ${timestamp}`
			: "  MV is EMPTY — no forward-materialized seam yet",
	);
	return timestamp;
}

/**
 * The exact timestamp where forward materialization took over, derived live.
 *
 * The MV's earliest bucket H only contains what materialized forward (first
 * run) or a complete backfilled hour (continuations). Either way, the min
 * timestamp of the LAST mv-count deduction rows in raw events for that hour
 * is the precise upper bound the backfill must fill up to: mid-bucket on a
 * fresh deploy, exactly H once the bucket is complete. Relies on live traffic
 * being timestamp-ordered at ingest; sub-second truncation of the boundary
 * loses at most the pre-promote sliver inside the seam second.
 */
function deriveSeam(minHour: string): string {
	const bucketStart = floorToHour(minHour);
	const bucketEnd = addHours(bucketStart, 1);

	console.log("  Deriving the exact seam within that bucket...");
	const mvCount = extractCount(
		tbSql(
			`SELECT toInt64(sum(deduction_count)) FROM ${DATASOURCE} WHERE hour = toDateTime('${bucketStart}')`,
		),
	);
	if (mvCount === 0) {
		// The bucket came from min(hour), so it MUST contain rows — zero means
		// the count query failed. Falling back to the hour boundary would
		// silently skip everything between it and the actual promote time.
		console.error(
			"\nRefusing to run: the MV count query for the seam bucket failed or" +
				"\nreturned zero, which is impossible for the min(hour) bucket." +
				"\nRe-run when tb is responsive.",
		);
		process.exit(1);
	}

	const seam = extractTimestamp(
		tbSql(
			`SELECT min(t) FROM (` +
				`SELECT timestamp AS t FROM events ` +
				`ARRAY JOIN JSONExtractArrayRaw(toString(deductions), 'list') AS d ` +
				`WHERE timestamp >= toDateTime('${bucketStart}') ` +
				`AND timestamp < toDateTime('${bucketEnd}') ` +
				`AND JSONExtractString(JSONExtractString(d), 'balance_id') != '' ` +
				`ORDER BY t DESC LIMIT ${mvCount})`,
		),
	);

	if (!seam) {
		console.error(
			"\nRefusing to run: the seam query returned nothing (timeout or error)." +
				"\nFalling back to the hour boundary would silently drop every event" +
				"\ninserted between it and the promote moment. Re-run when tb is" +
				"\nresponsive.",
		);
		process.exit(1);
	}

	// Truncate to whole seconds (the copy-pipe DateTime params carry no
	// fraction). Flooring can only lose the pre-promote sliver within the
	// seam second — never double-count.
	return seam.split(".")[0];
}

function getRowCount(): number {
	return extractCount(tbSql(`SELECT count() FROM ${DATASOURCE}`));
}

// ============================================================================
// COPY EXECUTION
// ============================================================================

async function waitForCopyJobs(): Promise<void> {
	const maxAttempts = 60;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const waiting = execCapture(
			"tb --cloud job ls --status waiting --kind copy 2>/dev/null | grep -c '^id:' || echo 0",
		);
		const working = execCapture(
			"tb --cloud job ls --status working --kind copy 2>/dev/null | grep -c '^id:' || echo 0",
		);
		// Failed/empty job-ls output must count as zero, not NaN — NaN kept
		// this loop spinning forever, which was the observed "hang".
		const total = (parseInt(waiting, 10) || 0) + (parseInt(working, 10) || 0);
		if (total === 0) return;
		if (attempt === 0) {
			console.log(`  Waiting for ${total} existing copy job(s)...`);
		}
		await sleep(5000);
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
				`tb --cloud copy run ${COPY_PIPE} --on-demand-compute --param start_date="${startDate}" --param end_date="${endDate}" --wait`,
				false,
			);
			return true;
		} catch (error: any) {
			const message = error.message || error.toString();
			if (attempt < retries) {
				console.log(
					`  Attempt ${attempt}/${retries} failed, retrying in ${RETRY_DELAY_MS / 1000}s...`,
				);
				console.log(`  Error: ${message.substring(0, 200)}`);
				await sleep(RETRY_DELAY_MS);
			} else {
				console.error(
					`  All ${retries} attempts failed for ${startDate} -> ${endDate}`,
				);
				console.error(`  Error: ${message}`);
				return false;
			}
		}
	}
	return false;
}

// ============================================================================
// CHUNKS
// ============================================================================

function generateChunksDownward(
	resumePoint: string,
	target: string,
	chunkHours: number,
): Chunk[] {
	const chunks: Chunk[] = [];
	let current = resumePoint;

	// A mid-hour seam gets its own partial chunk down to the hour boundary, so
	// every later chunk start is hour-aligned — which is what makes resuming
	// from floor(min(hour)) exact after an interruption.
	const aligned = floorToHour(resumePoint);
	if (aligned !== resumePoint && parseDate(aligned) > parseDate(target)) {
		chunks.push({ start: aligned, end: current });
		current = aligned;
	}

	while (parseDate(current) > parseDate(target)) {
		let prev = addHours(current, -chunkHours);
		if (parseDate(prev) < parseDate(target)) {
			prev = target;
		}
		chunks.push({ start: prev, end: current });
		current = prev;
	}

	return chunks;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	console.log(`=== ${DATASOURCE} Backfill (Downward Fill) ===\n`);
	const args = parseArgs();

	const minHour = getMinHour();
	if (!minHour) {
		console.error(
			"\nRefusing to run: the MV has no rows, so there is no seam to" +
				"\nanchor on. Wait for at least one event to forward-materialize" +
				"\nafter the deploy, then re-run.",
		);
		process.exit(1);
	}

	const resumePoint = deriveSeam(minHour);
	console.log(`  Derived seam: ${resumePoint}`);
	console.log(`\nResume point: ${resumePoint}`);
	console.log(`Target (oldest): ${args.targetDate}`);

	if (parseDate(resumePoint) <= parseDate(args.targetDate)) {
		console.log(`\n✓ Backfill complete. Rows: ${getRowCount()}`);
		process.exit(0);
	}

	const chunks = generateChunksDownward(
		resumePoint,
		args.targetDate,
		args.chunkHours,
	);
	console.log(`\n${chunks.length} chunks (${args.chunkHours}h each)`);
	console.log(`Direction: ${resumePoint} ↓ ${args.targetDate}\n`);

	if (args.dryRun) {
		console.log("DRY RUN — would process:\n");
		chunks.forEach((chunk, index) => {
			console.log(`  ${index + 1}. ${chunk.start} -> ${chunk.end}`);
		});
		process.exit(0);
	}

	for (let index = 0; index < chunks.length; index++) {
		const chunk = chunks[index];
		console.log(
			`=== Chunk ${index + 1}/${chunks.length}: ${chunk.start} -> ${chunk.end} ===`,
		);

		const started = Date.now();
		const success = await runCopyJob(chunk.start, chunk.end);
		const seconds = Math.round((Date.now() - started) / 1000);

		if (!success) {
			console.error(
				`✗ Chunk failed after ${seconds}s. Re-run the script to resume from here.`,
			);
			process.exit(1);
		}

		console.log(`✓ Done in ${seconds}s. MV rows: ${getRowCount()}\n`);
		await sleep(DELAY_BETWEEN_CHUNKS_MS);
	}

	console.log(`\n✓ Backfill complete. Rows: ${getRowCount()}`);
}

main();
