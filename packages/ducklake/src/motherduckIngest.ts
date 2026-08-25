import { DuckDBInstance } from "@duckdb/node-api";
import type { DucklakeLogger } from "./index.js";

const MD_DATABASE = "lake_cache";

type MdConnection = Awaited<
	ReturnType<Awaited<ReturnType<typeof DuckDBInstance.create>>["connect"]>
>;

/** One RW session per run — every extra MotherDuck touch bills a full
 * startup+cooldown window, so all swaps/status/rollup share this connection. */
export const withMotherDuckSession = async <T>({
	run,
}: {
	run: (connection: MdConnection) => Promise<T>;
}): Promise<T> => {
	const token = process.env.MOTHERDUCK_RW_TOKEN;
	if (!token) {
		throw new Error("[ducklake] MOTHERDUCK_RW_TOKEN is not configured");
	}
	const instance = await DuckDBInstance.create(
		`md:${MD_DATABASE}?attach_mode=single`,
		{ motherduck_token: token },
	);
	const connection = await instance.connect();
	try {
		return await run(connection);
	} finally {
		connection.closeSync();
	}
};

/** Single-statement atomic replace: readers observe the old table or the new
 * one, never a gap — stronger than the flights' drop+rename dance, and immune
 * to concurrent writers racing on a shared staging name. One legacy wrinkle:
 * these objects have historically been VIEWs, which CREATE OR REPLACE TABLE
 * cannot replace across object types. */
export const swapInParquetTable = async ({
	connection,
	table,
	parquetUrl,
	logger,
}: {
	connection: MdConnection;
	table: string;
	parquetUrl: string;
	logger: DucklakeLogger;
}): Promise<{ rowCount: number }> => {
	const existing = await connection.run(
		`SELECT table_type FROM information_schema.tables
		 WHERE table_catalog = '${MD_DATABASE}' AND table_schema = 'main' AND table_name = '${table}'`,
	);
	const existingRows = await existing.getRows();
	if (existingRows.length > 0) {
		const isView = String(existingRows[0][0]).toUpperCase().includes("VIEW");
		if (isView) {
			await connection.run(`DROP VIEW "${MD_DATABASE}".main."${table}"`);
		}
	}
	// MotherDuck pulls the parquet from S3 itself via its lake_s3 secret —
	// bytes never flow through this task's connection.
	await connection.run(`
		CREATE OR REPLACE TABLE "${MD_DATABASE}".main."${table}" AS
		SELECT * FROM read_parquet('${parquetUrl}')
	`);

	const counted = await connection.run(
		`SELECT COUNT(*) AS n FROM "${MD_DATABASE}".main."${table}"`,
	);
	const rowCount = Number((await counted.getRows())[0]?.[0] ?? 0);
	logger.info(
		{ type: "ducklake_ingest", rowCount },
		`[ducklake] ingested ${table}`,
	);
	return { rowCount };
};

/** Full-replace status table the Leaderboard freshness widget reads
 * (`max(refreshed_at)`); row_count widened to BIGINT (INTEGER was within 19x
 * of overflow at customer_entitlements' 114M). */
export const writeRefreshStatus = async ({
	connection,
	statusTable,
	rows,
}: {
	connection: MdConnection;
	statusTable: string;
	rows: { tbl: string; snapshot: string; rowCount: number }[];
}): Promise<void> => {
	if (rows.length === 0) return;
	const values = rows
		.map((r) => `('${r.tbl}', '${r.snapshot}', CAST(${r.rowCount} AS BIGINT))`)
		.join(", ");
	await connection.run(`
		CREATE OR REPLACE TABLE "${MD_DATABASE}".main."${statusTable}" AS
		SELECT tbl, snapshot, row_count, now() AS refreshed_at
		FROM (VALUES ${values}) AS t(tbl, snapshot, row_count)
	`);
};
