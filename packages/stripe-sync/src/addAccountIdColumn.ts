import pg from "pg";
import { SYNCED_TABLES } from "./eventTypeToTable.js";

/**
 * Adds `stripe_account_id` and `org_id` columns + indexes to all synced tables.
 * Idempotent -- safe to run multiple times.
 */
export const addAutumnColumns = async ({
	databaseUrl,
	schema = "stripe",
}: {
	databaseUrl: string;
	schema?: string;
}): Promise<void> => {
	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		for (const table of SYNCED_TABLES) {
			await client.query(`
				ALTER TABLE "${schema}"."${table}"
				ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
				ADD COLUMN IF NOT EXISTS org_id TEXT,
				ADD COLUMN IF NOT EXISTS env TEXT
			`);
			await client.query(`
				CREATE INDEX IF NOT EXISTS idx_${table}_stripe_account_id
				ON "${schema}"."${table}" (stripe_account_id)
			`);
			await client.query(`
				CREATE INDEX IF NOT EXISTS idx_${table}_org_id
				ON "${schema}"."${table}" (org_id)
			`);
		}
	} finally {
		await client.end();
	}
};
