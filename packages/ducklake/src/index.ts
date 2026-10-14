import { buildCeBalanceTotalsParquet } from "./buildCeBalanceTotals.js";
import { headlineTotalsSql } from "./headlineTotals.js";
import { openLocalLakeConnection } from "./localDuckDb.js";
import {
	buildMirrorParquet,
	COLD_MIRROR_TABLES,
	HOT_MIRROR_TABLES,
	type MirrorParquet,
} from "./mirrorTables.js";
import {
	swapInParquetTable,
	withMotherDuckSession,
	writeRefreshStatus,
} from "./motherduckIngest.js";

export type DucklakeLogger = {
	info: (obj: unknown, msg?: string) => void;
	warn: (obj: unknown, msg?: string) => void;
	error: (obj: unknown, msg?: string) => void;
};

export type DucklakeRunResult = {
	tablesRefreshed: string[];
	skipped: string[];
};

const isShadowMode = (): boolean => process.env.DUCKLAKE_SHADOW !== "0";

const isHourlyRun = (): boolean =>
	process.env.DUCKLAKE_FORCE_HOURLY === "1" || new Date().getMinutes() < 20;

type MirrorGroup = {
	tables: readonly string[];
	statusTable: string;
	withRollup: boolean;
};

const MIRROR_GROUPS: MirrorGroup[] = [
	{
		tables: HOT_MIRROR_TABLES,
		statusTable: "refresh_status",
		withRollup: true,
	},
	{
		tables: COLD_MIRROR_TABLES,
		statusTable: "refresh_status_cold",
		withRollup: false,
	},
];

export const runDucklake = async ({
	logger,
}: {
	logger: DucklakeLogger;
}): Promise<DucklakeRunResult> => {
	const runId = `${Date.now()}`;
	const shadow = isShadowMode();
	const hourly = isHourlyRun();
	const skipped: string[] = [];
	const producedName = (table: string): string =>
		shadow ? `${table}__ducklake` : table;

	const connection = await openLocalLakeConnection();
	const tScanStart = performance.now();

	const { parquetUrl: totalsParquetUrl } = await buildCeBalanceTotalsParquet({
		connection,
		runId,
	});

	const mirrorsByGroup = new Map<string, MirrorParquet[]>();
	if (hourly) {
		for (const group of MIRROR_GROUPS) {
			const mirrors: MirrorParquet[] = [];
			for (const table of group.tables) {
				try {
					mirrors.push(await buildMirrorParquet({ connection, table, runId }));
				} catch (error) {
					skipped.push(table);
					logger.warn(
						{ type: "ducklake_skip" },
						`[ducklake] scan failed for ${table}, leaving it stale: ${error}`,
					);
				}
			}
			mirrorsByGroup.set(group.statusTable, mirrors);
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

			for (const group of MIRROR_GROUPS) {
				if (!mirrorsByGroup.has(group.statusTable)) continue;
				const mirrors = mirrorsByGroup.get(group.statusTable) ?? [];

				const statusRows: {
					tbl: string;
					snapshot: string;
					rowCount: number;
				}[] = [];
				for (const mirror of mirrors) {
					try {
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
					} catch (error) {
						skipped.push(mirror.table);
						logger.warn(
							{ type: "ducklake_skip" },
							`[ducklake] ingest failed for ${mirror.table}, leaving it stale: ${error}`,
						);
					}
				}

				if (group.withRollup) {
					try {
						await md.run(
							headlineTotalsSql({
								targetTable: producedName("headline_totals"),
								sourceName: producedName,
							}),
						);
						refreshed.push(producedName("headline_totals"));
					} catch (error) {
						skipped.push("headline_totals");
						logger.warn(
							{ type: "ducklake_skip" },
							`[ducklake] headline_totals rollup failed, leaving it stale: ${error}`,
						);
					}
				}

				if (statusRows.length > 0) {
					await writeRefreshStatus({
						connection: md,
						statusTable: producedName(group.statusTable),
						rows: statusRows,
					});
					refreshed.push(producedName(group.statusTable));
				}
			}

			return refreshed;
		},
	});
	const ingestMs = Math.round(performance.now() - tIngestStart);

	if (tablesRefreshed.length === 0) {
		throw new Error("[ducklake] zero tables refreshed");
	}
	const allMirrors = [...HOT_MIRROR_TABLES, ...COLD_MIRROR_TABLES];
	if (hourly && allMirrors.every((t) => skipped.includes(t))) {
		throw new Error(
			`[ducklake] every mirror failed (skipped: ${skipped.join(", ")})`,
		);
	}

	logger.info(
		{
			type: "ducklake_phase",
			durationMs: scanMs + ingestMs,
		},
		`[ducklake] refreshed ${tablesRefreshed.join(", ")} (shadow=${shadow} hourly=${hourly} skipped=[${skipped.join(",")}] scan=${scanMs}ms ingest=${ingestMs}ms)`,
	);

	return { tablesRefreshed, skipped };
};
