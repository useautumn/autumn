import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { MIGRATIONS_DIR } from "../helpers/paths.ts";
import { type Env, targetHost, wrapInInfisical } from "../helpers/env.ts";

export async function cmdMarkApplied(env: Env): Promise<void> {
	await wrapInInfisical(env);

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("DATABASE_URL not set after infisical wrap");
		process.exit(1);
	}

	console.log(
		`[db:mark-applied] env=${env} host=${targetHost(databaseUrl)} migrations=${MIGRATIONS_DIR}`,
	);

	const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
	if (migrations.length === 0) {
		console.log("no migrations on disk — nothing to mark");
		return;
	}

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
		await client.query(`
			CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)
		`);

		let marked = 0;
		let already = 0;
		for (const migration of migrations) {
			const existing = await client.query<{ id: number }>(
				`SELECT id FROM "drizzle"."__drizzle_migrations" WHERE hash = $1 LIMIT 1`,
				[migration.hash],
			);

			if (existing.rowCount && existing.rowCount > 0) {
				console.log(`  already applied  hash=${migration.hash.slice(0, 12)}…`);
				already++;
				continue;
			}

			await client.query(
				`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
				[migration.hash, migration.folderMillis],
			);
			console.log(`  marked           hash=${migration.hash.slice(0, 12)}… when=${migration.folderMillis}`);
			marked++;
		}

		console.log(`done — marked=${marked} already=${already} total=${migrations.length}`);
	} finally {
		await client.end();
	}
}
