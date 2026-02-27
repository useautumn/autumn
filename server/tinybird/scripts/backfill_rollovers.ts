#!/usr/bin/env bun

/**
 * Offset-based idempotent backfill for rollovers from Postgres to Tinybird.
 *
 * Rollovers have no created_at so we can't chunk by date.
 * Pages through the full table with LIMIT + OFFSET ordered by id.
 * Stops when a page returns fewer rows than page_size.
 *
 * Usage:
 *   bun scripts/backfill_rollovers.ts
 *   bun scripts/backfill_rollovers.ts --page-size 1000
 *   bun scripts/backfill_rollovers.ts --offset 10000
 *   bun scripts/backfill_rollovers.ts --dry-run
 */

import {
	MAX_RETRIES,
	RETRY_DELAY_MS,
	DELAY_BETWEEN_CHUNKS_MS,
	exec,
	tbSql,
	sleep,
	extractNumber,
	waitForCopyJobs,
} from "./backfill_base.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DATASOURCE = "rollovers";
const COPY_PIPE = "rollovers_backfill";
const DEFAULT_PAGE_SIZE = 5000;

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(): { pageSize: number; offsetOverride?: number; dryRun: boolean } {
	const args = { pageSize: DEFAULT_PAGE_SIZE, offsetOverride: undefined as number | undefined, dryRun: false };

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--page-size" && process.argv[i + 1]) {
			args.pageSize = parseInt(process.argv[++i], 10);
		} else if (arg === "--offset" && process.argv[i + 1]) {
			args.offsetOverride = parseInt(process.argv[++i], 10);
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Offset-based backfill for rollovers

Usage: bun scripts/backfill_rollovers.ts [options]

Options:
  --page-size <n>   Rows per page (default: ${DEFAULT_PAGE_SIZE})
  --offset <n>      Start from this offset (default: 0)
  --dry-run         Print plan without executing
  --help, -h        Show this help
`);
			process.exit(0);
		}
	}

	return args;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getRowCount(): Promise<number> {
	const rows = await tbSql({
		query: `SELECT count() AS val FROM ${DATASOURCE} FINAL WHERE __action != 'delete'`,
	});
	return extractNumber({ rows, col: "val" }) ?? 0;
}

async function runPage({
	offset,
	pageSize,
	retries = MAX_RETRIES,
}: {
	offset: number;
	pageSize: number;
	retries?: number;
}): Promise<boolean> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await waitForCopyJobs();
			exec({
				cmd: `TB_VERSION_WARNING=0 tb --cloud copy run ${COPY_PIPE} --param offset="${offset}" --param page_size="${pageSize}" --wait`,
			});
			return true;
		} catch (error: any) {
			const msg = error.message || error.toString();
			if (attempt < retries) {
				console.log(`  Attempt ${attempt}/${retries} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
				console.log(`  Error: ${msg.substring(0, 200)}`);
				await sleep({ ms: RETRY_DELAY_MS });
			} else {
				console.error(`  All ${retries} attempts failed at offset ${offset}`);
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
	console.log("=== Rollovers Backfill (Offset-based) ===\n");

	const args = parseArgs();
	let offset = args.offsetOverride ?? 0;

	console.log(`Page size: ${args.pageSize}`);
	console.log(`Starting offset: ${offset}\n`);

	if (args.dryRun) {
		console.log("DRY RUN — would run pages starting at offset", offset);
		process.exit(0);
	}

	let pageNum = 0;

	while (true) {
		pageNum++;
		console.log(`=== Page ${pageNum}: offset=${offset} ===`);
		const startTime = Date.now();

		const success = await runPage({ offset, pageSize: args.pageSize });
		const duration = Math.round((Date.now() - startTime) / 1000);

		if (!success) {
			console.log(`✗ Page ${pageNum} FAILED after ${duration}s`);
			console.log("To resume from this point, re-run with:");
			console.log(`  bun scripts/backfill_rollovers.ts --offset ${offset}\n`);
			process.exit(1);
		}

		const rowCount = await getRowCount();
		console.log(`✓ Page ${pageNum} done in ${duration}s. Rows in Tinybird: ${rowCount}\n`);

		// A page returning fewer rows than page_size means we've hit the end
		// We detect this by comparing expected next offset vs actual row count
		offset += args.pageSize;
		if (rowCount < offset) {
			console.log("Last page was partial — backfill complete.");
			break;
		}

		await sleep({ ms: DELAY_BETWEEN_CHUNKS_MS });
	}

	console.log("==========================================");
	console.log("=== Rollovers Backfill Complete ===");
	console.log(`Total rollovers in Tinybird: ${await getRowCount()}`);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
