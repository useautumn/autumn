import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { applyMigration } from "../helpers/applyMigrations.ts";
import { type Env, targetHost, wrapInInfisical } from "../helpers/env.ts";
import { MIGRATIONS_DIR } from "../helpers/paths.ts";
import {
	getPendingMigrations,
	isLocalDatabase,
	type PendingMigration,
} from "../helpers/pendingMigrations.ts";
import {
	type BlockingStatement,
	findBlockingIndexStatements,
	findCreatedTables,
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
	console.log(
		`[db:migrate${tagStr}] env=${env} host=${targetHost(databaseUrl)}`,
	);

	if (opts.bootstrap) {
		console.log(
			"bootstrap mode: skipping index-DDL safety check (use only for fresh DBs)",
		);
	}

	const client = new pg.Client({
		connectionString: databaseUrl,
		connectionTimeoutMillis: 60_000,
	});
	await client.connect();
	let pending: PendingMigration[];
	try {
		pending = selectMigrationsToApply({
			unrecorded: await getPendingMigrations(client),
			databaseUrl,
		});
	} catch (err) {
		await client.end();
		throw err;
	}

	if (pending.length === 0) {
		await client.end();
		console.log("no pending migrations");
		return;
	}

	console.log(`${pending.length} pending migration(s):`);
	for (const migration of pending) {
		console.log(`  ${migration.tag}`);
	}

	const blockers = opts.bootstrap ? [] : collectBlockers(pending);

	if (opts.dryRun) {
		await client.end();
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
		await client.end();
		printBlockerError(blockers);
		process.exit(1);
	}

	try {
		await applyPending(client, pending);
	} finally {
		await client.end();
	}
}

/**
 * Applies pending migrations using drizzle's own readMigrationFiles (so hashes
 * match the tracking table drizzle/mark-applied write) but our own executor,
 * which — unlike drizzle's migrate() — can run CONCURRENTLY outside a transaction.
 */
async function applyPending(
	client: pg.Client,
	pending: PendingMigration[],
): Promise<void> {
	const pendingByMillis = new Map(pending.map((m) => [m.when, m.tag]));
	const toApply = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR })
		.filter((m) => pendingByMillis.has(m.folderMillis))
		.sort((a, b) => a.folderMillis - b.folderMillis);

	console.log(`\napplying ${toApply.length} migration(s)...`);

	try {
		for (const migration of toApply) {
			const tag = pendingByMillis.get(migration.folderMillis) ?? "migration";
			console.log(`  applying ${tag}...`);
			const { transactional } = await applyMigration(client, migration);
			console.log(`  applied ${tag}${transactional ? "" : " (concurrent)"}`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`\nmigration failed: ${message}`);
		process.exitCode = 1;
		return;
	}

	console.log(`done — applied ${toApply.length} migration(s)`);
}

/**
 * A shared DB that recorded a newer branch-only migration would skip older ones forever,
 * so local DBs apply those gaps; remote DBs keep drizzle-kit's order and only warn.
 */
function selectMigrationsToApply({
	unrecorded,
	databaseUrl,
}: {
	unrecorded: PendingMigration[];
	databaseUrl: string;
}): PendingMigration[] {
	const outOfOrder = unrecorded.filter((migration) => migration.outOfOrder);
	if (outOfOrder.length === 0) return unrecorded;

	const tags = outOfOrder.map((migration) => migration.tag).join(", ");
	if (isLocalDatabase(databaseUrl)) {
		console.log(`applying out-of-order migration(s) on a local DB: ${tags}`);
		return unrecorded;
	}

	console.warn(
		`WARNING: unrecorded migration(s) older than the newest applied one are skipped: ${tags}`,
	);
	return unrecorded.filter((migration) => !migration.outOfOrder);
}

type FlaggedBlocker = {
	migration: PendingMigration;
	blocker: BlockingStatement;
};

function collectBlockers(pending: PendingMigration[]): FlaggedBlocker[] {
	const newTables = findCreatedTables(
		pending.map((migration) => migration.sql),
	);
	const all: FlaggedBlocker[] = [];
	for (const migration of pending) {
		for (const blocker of findBlockingIndexStatements(
			migration.sql,
			newTables,
		)) {
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
