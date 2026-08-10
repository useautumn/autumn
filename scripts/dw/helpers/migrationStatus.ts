import pg from "pg";
import { getPendingMigrations } from "../../db/helpers/pendingMigrations.ts";
import { forceSslVerifyFull } from "./url.ts";

export async function hasPendingMigrations(
	databaseUrl: string,
): Promise<boolean> {
	const client = new pg.Client({
		connectionString: forceSslVerifyFull(databaseUrl),
	});
	await client.connect();
	try {
		return (await getPendingMigrations(client)).length > 0;
	} finally {
		await client.end();
	}
}
