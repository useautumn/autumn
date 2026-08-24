/**
 * ducklake: in-region lake aggregation job. Scans the Iceberg lake from
 * us-east-2 (same-region S3 = free), writes prepared parquet to a scratch
 * prefix, then has MotherDuck ingest the small files — replacing the
 * cross-region flights and the server cron's MotherDuck rebuild.
 * Contracts + phases: plans/ducklake/research.md
 */

import { buildCeBalanceTotalsParquet } from "./buildCeBalanceTotals.js";
import { openLocalLakeConnection } from "./localDuckDb.js";
import { ingestParquetTable } from "./motherduckIngest.js";

/** Structural so both pino and the server's logtail logger satisfy it. */
export type DucklakeLogger = {
	info: (obj: unknown, msg?: string) => void;
	warn: (obj: unknown, msg?: string) => void;
	error: (obj: unknown, msg?: string) => void;
};

export type DucklakeRunResult = {
	tablesRefreshed: string[];
	skipped: string[];
};

/** Shadow mode writes `<table>__ducklake` so the output can be diffed against
 * the incumbent writer's table before taking over the real name. */
const isShadowMode = (): boolean => process.env.DUCKLAKE_SHADOW !== "0";

export const runDucklake = async ({
	logger,
}: {
	logger: DucklakeLogger;
}): Promise<DucklakeRunResult> => {
	const runId = `${Date.now()}`;
	const shadow = isShadowMode();
	const connection = await openLocalLakeConnection();

	const tScanStart = performance.now();
	const { parquetUrl } = await buildCeBalanceTotalsParquet({
		connection,
		runId,
	});
	const scanMs = Math.round(performance.now() - tScanStart);

	const targetTable = shadow
		? "ce_balance_totals__ducklake"
		: "ce_balance_totals";
	const tIngestStart = performance.now();
	const { rowCount } = await ingestParquetTable({
		table: targetTable,
		parquetUrl,
		logger,
	});
	const ingestMs = Math.round(performance.now() - tIngestStart);

	// Reuse existing Axiom fields (durationMs/rowCount); breakdown stays in msg.
	logger.info(
		{
			type: "ducklake_phase",
			rowCount,
			durationMs: scanMs + ingestMs,
		},
		`[ducklake] ce_balance_totals refreshed (shadow=${shadow} scan=${scanMs}ms ingest=${ingestMs}ms)`,
	);

	return { tablesRefreshed: [targetTable], skipped: [] };
};
