#!/usr/bin/env bun

/**
 * Shared utilities and config for all epoch-ms-chunked Tinybird backfill scripts.
 */

import { execSync } from "child_process";

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 5000;
export const DELAY_BETWEEN_CHUNKS_MS = 2000;
export const DEFAULT_CHUNK_DAYS = 30;

// ============================================================================
// TYPES
// ============================================================================

export interface Chunk {
	startEpochMs: number;
	endEpochMs: number;
}

export interface TableConfig {
	/** Human-readable label, e.g. "Customers" */
	label: string;
	/** Tinybird copy pipe name, e.g. "customers_backfill" */
	copyPipeName: string;
	/** Tinybird datasource table name, e.g. "customers" */
	datasource: string;
	/** Epoch ms of the earliest known row in Postgres */
	startEpochMs: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

export function execCapture({ cmd }: { cmd: string }): string {
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (error: any) {
		return error.stdout?.trim() ?? "";
	}
}

const TB_API_URL = process.env.TINYBIRD_API_URL ?? "https://api.us-west-2.aws.tinybird.co";
const TB_TOKEN = process.env.TINYBIRD_TOKEN;

if (!TB_TOKEN) {
	console.error("TINYBIRD_TOKEN env var is not set. Export it before running backfill scripts.");
	process.exit(1);
}

/** Query Tinybird SQL API directly — returns parsed rows as an array of objects. */
export async function tbSql({ query }: { query: string }): Promise<Record<string, unknown>[]> {
	const queryWithFormat = `${query.trimEnd()} FORMAT JSONEachRow`;
	const url = `${TB_API_URL}/v0/sql?q=${encodeURIComponent(queryWithFormat)}`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${TB_TOKEN}` },
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Tinybird SQL API error ${res.status}: ${body}`);
	}
	const text = await res.text();
	// JSONEachRow returns one JSON object per line
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

export function exec({ cmd }: { cmd: string }): void {
	execSync(cmd, { encoding: "utf-8", stdio: "inherit" });
}

export async function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract a single numeric value from the first row/column of a tbSql result. */
export function extractNumber({ rows, col }: { rows: Record<string, unknown>[]; col: string }): number | null {
	const val = rows[0]?.[col];
	if (val === null || val === undefined) return null;
	const num = Number(val);
	return isNaN(num) ? null : num;
}

export function formatEpochMs({ epochMs }: { epochMs: number }): string {
	return new Date(epochMs).toISOString();
}

// ============================================================================
// TINYBIRD HELPERS
// ============================================================================

/** Returns the MAX created_at among backfill ('read') rows, or null if none. */
export async function getMaxCreatedAt({ datasource }: { datasource: string }): Promise<number | null> {
	const rows = await tbSql({
		query: `SELECT max(created_at) AS val FROM ${datasource} WHERE __action = 'read'`,
	});
	const num = extractNumber({ rows, col: "val" });
	return num && num > 0 ? num : null;
}

/** Returns count of non-deleted rows in the datasource. */
export async function getRowCount({ datasource }: { datasource: string }): Promise<number> {
	const rows = await tbSql({
		query: `SELECT count() AS val FROM ${datasource} FINAL WHERE __action != 'delete'`,
	});
	return extractNumber({ rows, col: "val" }) ?? 0;
}

// ============================================================================
// CHUNK GENERATION (FORWARD — oldest → newest)
// ============================================================================

export function generateChunksForward({
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

export async function waitForCopyJobs(): Promise<void> {
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

export async function runCopyJob({
	copyPipeName,
	startEpochMs,
	endEpochMs,
	retries = MAX_RETRIES,
}: {
	copyPipeName: string;
	startEpochMs: number;
	endEpochMs: number;
	retries?: number;
}): Promise<boolean> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await waitForCopyJobs();
			exec({
				cmd: `tb --cloud copy run ${copyPipeName} --param start_epoch_ms="${startEpochMs}" --param end_epoch_ms="${endEpochMs}" --wait`,
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
// CORE BACKFILL RUNNER
// ============================================================================

/**
 * Runs a complete forward (oldest → newest) backfill for a single table config.
 * Idempotent: resumes from MAX(created_at) of existing 'read' rows.
 */
export async function runTableBackfill({
	config,
	chunkDays,
	dryRun,
}: {
	config: TableConfig;
	chunkDays: number;
	dryRun: boolean;
}): Promise<void> {
	console.log(`\n=== ${config.label} Backfill ===`);

	const tinybirdMax = await getMaxCreatedAt({ datasource: config.datasource });
	if (tinybirdMax) {
		console.log(`  Resume point: ${tinybirdMax} (${formatEpochMs({ epochMs: tinybirdMax })})`);
	} else {
		console.log("  No backfilled rows yet — starting from beginning");
	}

	const resumePoint = tinybirdMax ? tinybirdMax + 1 : config.startEpochMs;
	const endPoint = Date.now();

	console.log(`  Start: ${formatEpochMs({ epochMs: resumePoint })}`);
	console.log(`  End:   ${formatEpochMs({ epochMs: endPoint })}`);

	if (resumePoint >= endPoint) {
		console.log(`  Already complete. Rows in Tinybird: ${await getRowCount({ datasource: config.datasource })}`);
		return;
	}

	const chunks = generateChunksForward({ startEpochMs: resumePoint, endEpochMs: endPoint, chunkDays });
	console.log(`  Chunks: ${chunks.length} (${chunkDays} days each)\n`);

	if (dryRun) {
		chunks.forEach((chunk, i) => {
			console.log(
				`  ${i + 1}. ${formatEpochMs({ epochMs: chunk.startEpochMs })} -> ${formatEpochMs({ epochMs: chunk.endEpochMs })}`,
			);
		});
		return;
	}

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const chunkNum = i + 1;

		console.log(
			`Chunk ${chunkNum}/${chunks.length}: ${formatEpochMs({ epochMs: chunk.startEpochMs })} -> ${formatEpochMs({ epochMs: chunk.endEpochMs })}`,
		);

		const startTime = Date.now();
		const success = await runCopyJob({
			copyPipeName: config.copyPipeName,
			startEpochMs: chunk.startEpochMs,
			endEpochMs: chunk.endEpochMs,
		});
		const duration = Math.round((Date.now() - startTime) / 1000);

		if (success) {
			const count = await getRowCount({ datasource: config.datasource });
			console.log(`  ✓ Chunk ${chunkNum} done in ${duration}s. Rows: ${count}\n`);
		} else {
			console.log(`  ✗ Chunk ${chunkNum} FAILED after ${duration}s`);
			console.log("  Re-run this script to resume.\n");
			process.exit(1);
		}

		if (i < chunks.length - 1) {
			await sleep({ ms: DELAY_BETWEEN_CHUNKS_MS });
		}
	}

	console.log(`=== ${config.label} Backfill Complete. Rows: ${await getRowCount({ datasource: config.datasource })} ===\n`);
}
