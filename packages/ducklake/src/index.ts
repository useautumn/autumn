/**
 * ducklake: in-region lake aggregation job. Scans the Iceberg lake from
 * us-east-2 (same-region S3 = free), writes prepared parquet to a scratch
 * prefix, then has MotherDuck ingest the small files — replacing the
 * cross-region flights and the server cron's MotherDuck rebuild.
 * Contracts + phases: plans/ducklake/research.md
 */

import { buildCeBalanceTotalsParquet } from "./buildCeBalanceTotals.js";
import { headlineTotalsSql } from "./headlineTotals.js";
import { openLocalLakeConnection } from "./localDuckDb.js";
import {
	buildMirrorParquet,
	HOT_MIRROR_TABLES,
	type MirrorParquet,
} from "./mirrorTables.js";
import {
	swapInParquetTable,
	withMotherDuckSession,
	writeRefreshStatus,
} from "./motherduckIngest.js";

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

/** Shadow mode suffixes every produced table so output can be diffed against
 * the incumbent writers before taking over the real names. */
const isShadowMode = (): boolean => process.env.DUCKLAKE_SHADOW !== "0";

/** The job fires every 20 minutes; mirrors are hourly. The container is
 * stateless, so gate by wall-clock: only the top-of-hour run mirrors. */
const isHourlyRun = (): boolean =>
	process.env.DUCKLAKE_FORCE_HOURLY === "1" || new Date().getMinutes() < 20;

export const runDucklake = async ({
	logger,
}: {
	logger: DucklakeLogger;
}): Promise<DucklakeRunResult> => {
	const runId = `${Date.now()}`;
	const shadow = isShadowMode();
	const hourly = isHourlyRun();
	const producedName = (table: string): string =>
		shadow ? `${table}__ducklake` : table;

	const connection = await openLocalLakeConnection();
	const tScanStart = performance.now();

	const { parquetUrl: totalsParquetUrl } = await buildCeBalanceTotalsParquet({
		connection,
		runId,
	});

	// Sequential: one embedded engine; each scan already parallelizes inside.
	const mirrors: MirrorParquet[] = [];
	if (hourly) {
		for (const table of HOT_MIRROR_TABLES) {
			mirrors.push(await buildMirrorParquet({ connection, table, runId }));
		}
	}
	const scanMs = Math.round(performance.now() - tScanStart);

	const tIngestStart = performance.now();
	const tablesRefreshed = await withMotherDuckSession({
		run: async (md) => {
			const refreshed: string[] = [];

			const totalsTable = producedName("ce_balance_totals");
			const { rowCount: totalsRows } = await swapInParquetTable({
				connection: md,
				table: totalsTable,
				parquetUrl: totalsParquetUrl,
				logger,
			});
			refreshed.push(`${totalsTable}:${totalsRows}`);

			const statusRows: { tbl: string; snapshot: string; rowCount: number }[] =
				[];
			for (const mirror of mirrors) {
				const table = producedName(mirror.table);
				const { rowCount } = await swapInParquetTable({
					connection: md,
					table,
					parquetUrl: mirror.parquetUrl,
					logger,
				});
				statusRows.push({
					tbl: mirror.table,
					snapshot: mirror.snapshot,
					rowCount,
				});
				refreshed.push(`${table}:${rowCount}`);
			}

			if (mirrors.length > 0) {
				// Rollup runs on MD because fx_rates only exists there; reads the
				// just-swapped mirrors (shadow-suffixed in shadow mode).
				await md.run(
					headlineTotalsSql({
						targetTable: producedName("headline_totals"),
						sourceName: producedName,
					}),
				);
				refreshed.push(producedName("headline_totals"));

				await writeRefreshStatus({
					connection: md,
					statusTable: producedName("refresh_status"),
					rows: statusRows,
				});
				refreshed.push(producedName("refresh_status"));
			}

			return refreshed;
		},
	});
	const ingestMs = Math.round(performance.now() - tIngestStart);

	// Reuse existing Axiom fields (durationMs); breakdown stays in msg.
	logger.info(
		{
			type: "ducklake_phase",
			durationMs: scanMs + ingestMs,
		},
		`[ducklake] refreshed ${tablesRefreshed.join(", ")} (shadow=${shadow} hourly=${hourly} scan=${scanMs}ms ingest=${ingestMs}ms)`,
	);

	return {
		tablesRefreshed,
		skipped: hourly ? [] : [...HOT_MIRROR_TABLES],
	};
};
