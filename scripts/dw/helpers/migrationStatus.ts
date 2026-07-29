import pg from "pg";
import { getPendingMigrations } from "../../db/helpers/pendingMigrations.ts";

export async function hasPendingMigrations(
	databaseUrl: string,
): Promise<boolean> {
	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		return (await getPendingMigrations(client)).length > 0;
	} finally {
		await client.end();
	}
}
