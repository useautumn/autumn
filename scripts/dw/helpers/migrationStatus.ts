import pg from "pg";
import { getPendingMigrations } from "../../db/helpers/pendingMigrations.ts";

export async function hasPendingMigrations(
	databaseUrl: string,
): Promise<boolean> {
	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		const pending = await getPendingMigrations(client);
		return pending.some((migration) => !migration.outOfOrder);
	} finally {
		await client.end();
	}
}
