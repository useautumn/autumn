import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { MIGRATIONS_DIR } from "../helpers/paths.ts";
import { type Env, targetHost, wrapInInfisical } from "../helpers/env.ts";
import { applyMigration } from "../helpers/applyMigrations.ts";
import {
	getPendingMigrations,
	type PendingMigration,
} from "../helpers/pendingMigrations.ts";
import {
	type BlockingStatement,
	findBlockingIndexStatements,
} from "../helpers/safetyCheck.ts";

export async function cmdMigrate(
	env: Env,
	opts: { dryRun: boolean; bootstrap: boolean },
): Promise<void> {
	await wrapInInfisical(env);

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("DATABASE_URL not set after infisical wrap");
		process.exit(1);
	}

	const tags = [
		opts.dryRun ? "DRY" : null,
		opts.bootstrap ? "BOOTSTRAP" : null,
	].filter(Boolean);
	const tagStr = tags.length > 0 ? ` (${tags.join(" ")})` : "";
	console.log(`[db:migrate${tagStr}] env=${env} host=${targetHost(databaseUrl)}`);

	if (opts.bootstrap) {
		console.log(
			"bootstrap mode: skipping index-DDL safety check (use only for fresh DBs)",
		);
	}

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	let pending: PendingMigration[];
	try {
		pending = await getPendingMigrations(client);
	} finally {
		await client.end();
	}

	if (pending.length === 0) {
		console.log("no pending migrations");
		return;
	}

	console.log(`${pending.length} pending migration(s):`);
	for (const migration of pending) {
		console.log(`  ${migration.tag}`);
	}

	const blockers = opts.bootstrap ? [] : collectBlockers(pending);

	if (opts.dryRun) {
		console.log("");
		console.log("--- SQL preview ---");
		for (const migration of pending) {
			console.log("");
			console.log(`-- ${migration.tag}.sql --`);
			console.log(migration.sql);
		}
		console.log("");
		if (blockers.length > 0) {
			printBlockerError(blockers);
			console.log("dry-run: would refuse to apply.");
			process.exit(1);
		}
		console.log(
			`dry-run: ok — \`bun db migrate --env=${env}\` would apply these.`,
		);
		return;
	}

	if (blockers.length > 0) {
		printBlockerError(blockers);
		process.exit(1);
	}

	await applyPending(databaseUrl, pending);
}

/**
 * Applies pending migrations using drizzle's own readMigrationFiles (so hashes
 * match the tracking table drizzle/mark-applied write) but our own executor,
 * which — unlike drizzle's migrate() — can run CONCURRENTLY outside a transaction.
 */
async function applyPending(
	databaseUrl: string,
	pending: PendingMigration[],
): Promise<void> {
	const pendingByMillis = new Map(pending.map((m) => [m.when, m.tag]));
	const toApply = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR })
		.filter((m) => pendingByMillis.has(m.folderMillis))
		.sort((a, b) => a.folderMillis - b.folderMillis);

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		for (const migration of toApply) {
			const tag = pendingByMillis.get(migration.folderMillis) ?? "migration";
			const { transactional } = await applyMigration(client, migration);
			console.log(`  applied ${tag}${transactional ? "" : " (concurrent)"}`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`\nmigration failed: ${message}`);
		process.exitCode = 1;
		return;
	} finally {
		await client.end();
	}

	console.log(`done — applied ${toApply.length} migration(s)`);
}

type FlaggedBlocker = {
	migration: PendingMigration;
	blocker: BlockingStatement;
};

function collectBlockers(pending: PendingMigration[]): FlaggedBlocker[] {
	const all: FlaggedBlocker[] = [];
	for (const migration of pending) {
		for (const blocker of findBlockingIndexStatements(migration.sql)) {
			all.push({ migration, blocker });
		}
	}
	return all;
}

function printBlockerError(blockers: FlaggedBlocker[]): void {
	console.error("");
	console.error(
		`refusing to apply ${blockers.length} index DDL statement(s) without CONCURRENTLY:`,
	);
	for (const { migration, blocker } of blockers) {
		console.error("");
		console.error(`  in ${migration.tag}.sql  [${blocker.kind}]`);
		const indented = blocker.statement
			.split("\n")
			.map((line) => `    ${line}`)
			.join("\n");
		console.error(indented);
	}
	console.error("");
	console.error(
		"Index DDL without CONCURRENTLY takes an ACCESS EXCLUSIVE lock that blocks reads/writes on the table.",
	);
	console.error("");
	console.error("Options:");
	console.error(
		"  1. Apply this migration manually (psql / TablePlus) with CONCURRENTLY, then `bun db mark-applied --env=<env>` to record it.",
	);
	console.error(
		"  2. If the table is fresh or empty, add `.concurrently()` to the index in shared/db schema, `bun db generate`, and re-try.",
	);
}
