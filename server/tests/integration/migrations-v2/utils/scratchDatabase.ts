import { randomUUID } from "node:crypto";
import pg from "pg";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

/** Only a dedicated loopback PostgreSQL named by MIGRATION_TEST_DATABASE_URL;
 * never the app's DATABASE_URL. */
export const migrationTestDatabaseUrl = (): string | undefined => {
	const url = process.env.MIGRATION_TEST_DATABASE_URL;
	if (!url) return undefined;
	return LOOPBACK_HOSTS.includes(new URL(url).hostname) ? url : undefined;
};

/** Runs `run` inside a fresh schema the test owns; unqualified tables resolve
 * there via search_path, and only that schema is dropped afterwards. */
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
