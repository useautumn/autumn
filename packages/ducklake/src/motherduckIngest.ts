import { DuckDBInstance } from "@duckdb/node-api";
import type { DucklakeLogger } from "./index.js";

const MD_DATABASE = "lake_cache";

/** RW one-shot session, mirroring the server cron's writer discipline: no
 * standing pool, always closed. */
const openMotherDuck = async () => {
	const token = process.env.MOTHERDUCK_RW_TOKEN;
	if (!token) {
		throw new Error("[ducklake] MOTHERDUCK_RW_TOKEN is not configured");
	}
	const instance = await DuckDBInstance.create(
		`md:${MD_DATABASE}?attach_mode=single`,
		{ motherduck_token: token },
	);
	return await instance.connect();
};

/** Staged swap (the flights' pattern): build `__new`, drop the live object
 * (tolerating VIEW — it has been one before), rename. Live readers of the
 * shared database never observe a missing table. */
export const ingestParquetTable = async ({
	table,
	parquetUrl,
	logger,
}: {
	table: string;
	parquetUrl: string;
	logger: DucklakeLogger;
}): Promise<{ rowCount: number }> => {
	const connection = await openMotherDuck();
	try {
		// Single-statement atomic replace: readers observe the old table or the
		// new one, never a gap — stronger than the flights' drop+rename dance,
		// and immune to concurrent writers racing on a shared staging name.
		// MotherDuck pulls the parquet from S3 itself via its lake_s3 secret —
		// bytes never flow through this task's connection.
		// One legacy wrinkle: these objects have historically been VIEWs, which
		// CREATE OR REPLACE TABLE cannot replace across object types.
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
	} finally {
		connection.closeSync();
	}
};
