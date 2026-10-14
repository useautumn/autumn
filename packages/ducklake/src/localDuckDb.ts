import { DuckDBInstance } from "@duckdb/node-api";

export type DuckDbConnection = Awaited<
	ReturnType<Awaited<ReturnType<typeof DuckDBInstance.create>>["connect"]>
>;

export const openLocalLakeConnection = async (): Promise<DuckDbConnection> => {
	const keyId = process.env.AWS_ACCESS_KEY_ID;
	const secret = process.env.AWS_SECRET_ACCESS_KEY;
	if (!keyId || !secret) {
		throw new Error("[ducklake] AWS credentials are not configured");
	}

	const instance = await DuckDBInstance.create(":memory:");
	const connection = await instance.connect();
	await connection.run("INSTALL iceberg; LOAD iceberg;");
	await connection.run("INSTALL httpfs; LOAD httpfs;");
	await connection.run("SET temp_directory = '/tmp/ducklake-spill';");
	const memoryLimit = process.env.DUCKLAKE_MEMORY_LIMIT;
	if (memoryLimit) {
		await connection.run(`SET memory_limit = '${memoryLimit}';`);
	}
	await connection.run(
		`CREATE SECRET lake (TYPE S3, KEY_ID '${keyId}', SECRET '${secret}', REGION 'us-east-2');`,
	);
	return connection;
};
