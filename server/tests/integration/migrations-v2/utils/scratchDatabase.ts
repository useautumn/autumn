import { randomUUID } from "node:crypto";
import pg from "pg";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

export const migrationTestDatabaseUrl = (): string | undefined => {
	const url = process.env.MIGRATION_TEST_DATABASE_URL;
	if (!url) return undefined;
	return LOOPBACK_HOSTS.includes(new URL(url).hostname) ? url : undefined;
};

export const withScratchSchema = async ({
	databaseUrl,
	run,
}: {
	databaseUrl: string;
	run: (args: { options: string }) => Promise<void>;
}) => {
	const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
	const admin = new pg.Client({ connectionString: databaseUrl });
	await admin.connect();
	try {
		await admin.query(`CREATE SCHEMA ${schema}`);
		await run({ options: `-c search_path=${schema}` });
	} finally {
		await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await admin.end();
	}
};

export const withScratchDatabase = async ({
	databaseUrl,
	run,
}: {
	databaseUrl: string;
	run: (args: { databaseUrl: string }) => Promise<void>;
}) => {
	const name = `migration_test_${randomUUID().replaceAll("-", "")}`;
	const admin = new pg.Client({ connectionString: databaseUrl });
	await admin.connect();
	try {
		await admin.query(`CREATE DATABASE ${name}`);
		const scratchUrl = new URL(databaseUrl);
		scratchUrl.pathname = `/${name}`;
		await run({ databaseUrl: scratchUrl.toString() });
	} finally {
		await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
		await admin.end();
	}
};
