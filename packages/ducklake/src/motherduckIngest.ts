import { DuckDBInstance } from "@duckdb/node-api";
import type { DucklakeLogger } from "./index.js";

export const MD_DATABASE = "lake_cache_v2";

type MdConnection = Awaited<
	ReturnType<Awaited<ReturnType<typeof DuckDBInstance.create>>["connect"]>
>;

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
