import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { InsertCheckout } from "@autumn/shared";
import {
	BillingOperationState,
	billingOperations,
} from "@models/billingOperationModels/billingOperationTable";
import { checkouts } from "@models/checkouts/checkoutTable";
import { getTableColumns } from "drizzle-orm";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import { getTableConfig } from "drizzle-orm/pg-core";
import type pg from "pg";

const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");
const importScript = async <T>(relativePath: string): Promise<T> =>
	(await import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href)) as T;
const { applyMigration } = await importScript<{
	applyMigration: (
		client: pg.Client,
		migration: MigrationMeta,
	) => Promise<{ transactional: boolean }>;
}>("scripts/db/helpers/applyMigrations.ts");
const { getPendingMigrations } = await importScript<{
	getPendingMigrations: (
		client: pg.Client,
	) => Promise<Array<{ tag: string; when: number }>>;
}>("scripts/db/helpers/pendingMigrations.ts");
const { findBlockingIndexStatements } = await importScript<{
	findBlockingIndexStatements: (sql: string) => unknown[];
}>("scripts/db/helpers/safetyCheck.ts");
const MIGRATIONS_DIRECTORY = path.join(REPO_ROOT, "shared/drizzle");
const journal = JSON.parse(
	readFileSync(path.join(MIGRATIONS_DIRECTORY, "meta/_journal.json"), "utf8"),
) as {
	entries: Array<{ idx: number; version: string; when: number; tag: string }>;
};
const migrationEntry = journal.entries.find(
	(entry) => entry.tag === "0073_panoramic_lilith",
);
if (!migrationEntry) throw new Error("Missing billing operation migration");
const previousMigrationEntry = journal.entries.find(
	(entry) => entry.idx === migrationEntry.idx - 1,
);
if (!previousMigrationEntry) throw new Error("Missing preceding migration");
const previousMigrationWhen = previousMigrationEntry.when;
const migrationSql = readFileSync(
	path.join(MIGRATIONS_DIRECTORY, `${migrationEntry.tag}.sql`),
	"utf8",
);
const migrationMetadata = readMigrationFiles({
	migrationsFolder: MIGRATIONS_DIRECTORY,
}).find((migration) => migration.folderMillis === migrationEntry.when);
if (!migrationMetadata) throw new Error("Missing billing operation metadata");

const assertCheckoutInsertUnchanged = (): void => {
	const checkout = {} as InsertCheckout;
	// @ts-expect-error billing operations are not checkout insert fields
	checkout.operation_id = "operation_1";
	// @ts-expect-error billing operation hashes are not checkout insert fields
	checkout.canonical_request_hash = "hash";
};
void assertCheckoutInsertUnchanged;

class TransactionalMigrationClient {
	readonly queries: string[] = [];
	readonly applied = [previousMigrationWhen];
	tableExists = false;
	failBeforeTracking = false;
	private transactionSnapshot: {
		applied: number[];
		tableExists: boolean;
	} | null = null;

	async query(sql: string, params: unknown[] = []) {
		const normalized = sql.trim();
		this.queries.push(normalized);

		if (normalized === "BEGIN") {
			this.transactionSnapshot = {
				applied: [...this.applied],
				tableExists: this.tableExists,
			};
			return { rowCount: 0, rows: [] };
		}
		if (normalized === "COMMIT") {
			this.transactionSnapshot = null;
			return { rowCount: 0, rows: [] };
		}
		if (normalized === "ROLLBACK") {
			if (this.transactionSnapshot) {
				this.applied.splice(
					0,
					this.applied.length,
					...this.transactionSnapshot.applied,
				);
				this.tableExists = this.transactionSnapshot.tableExists;
			}
			this.transactionSnapshot = null;
			return { rowCount: 0, rows: [] };
		}
		if (normalized.startsWith('CREATE TABLE "billing_operations"')) {
			if (this.tableExists)
				throw new Error("billing_operations already exists");
			this.tableExists = true;
			return { rowCount: 0, rows: [] };
		}
		if (normalized.startsWith('INSERT INTO "drizzle"."__drizzle_migrations"')) {
			if (this.failBeforeTracking) {
				this.failBeforeTracking = false;
				throw new Error("simulated interruption before migration tracking");
			}
			this.applied.push(Number(params[1]));
			return { rowCount: 1, rows: [] };
		}
		if (normalized.startsWith("SELECT created_at FROM")) {
			const createdAt = Math.max(...this.applied);
			return { rowCount: 1, rows: [{ created_at: String(createdAt) }] };
		}
		if (
			normalized.startsWith("CREATE SCHEMA IF NOT EXISTS") ||
			normalized.startsWith("CREATE TABLE IF NOT EXISTS")
		) {
			return { rowCount: 0, rows: [] };
		}

		throw new Error(`Unexpected migration query: ${normalized}`);
	}
}

const asPgClient = (client: TransactionalMigrationClient): pg.Client =>
	client as unknown as pg.Client;

const listSourceFiles = (directory: string): string[] => {
	const files: string[] = [];
	for (const entry of readdirSync(directory)) {
		const absolutePath = path.join(directory, entry);
		if (statSync(absolutePath).isDirectory()) {
			files.push(...listSourceFiles(absolutePath));
		} else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
			files.push(absolutePath);
		}
	}
	return files;
};

describe("billing operation foundation", () => {
	test("defines the dedicated ledger without changing checkout storage", () => {
		expect(Object.keys(getTableColumns(checkouts))).toEqual([
			"id",
			"org_id",
			"env",
			"internal_customer_id",
			"customer_id",
			"action",
			"params",
			"params_version",
			"status",
			"response",
			"stripe_invoice_id",
			"created_at",
			"expires_at",
			"completed_at",
		]);
		expect(Object.keys(getTableColumns(billingOperations))).toEqual([
			"org_id",
			"env",
			"operation_id",
			"billing_action",
			"canonical_request_hash",
			"canonical_request",
			"state",
			"created_at",
			"updated_at",
			"expires_at",
		]);
		expect(billingOperations.state.default).toBe(BillingOperationState.Pending);

		const tableConfig = getTableConfig(billingOperations);
		expect(tableConfig.uniqueConstraints).toHaveLength(1);
		expect(
			tableConfig.uniqueConstraints[0]?.columns.map((column) => column.name),
		).toEqual(["org_id", "env", "operation_id"]);
	});

	test("keeps the migration transactional and free of index DDL", () => {
		expect(migrationSql).toContain('CREATE TABLE "billing_operations"');
		expect(migrationSql).toContain(
			'CONSTRAINT "billing_operations_org_env_operation_id_key" UNIQUE("org_id","env","operation_id")',
		);
		expect(migrationSql).not.toContain("CONCURRENTLY");
		expect(findBlockingIndexStatements(migrationSql)).toEqual([]);
	});

	test("applies once and is absent from pending migrations on retry", async () => {
		const client = new TransactionalMigrationClient();
		const pgClient = asPgClient(client);

		const pending = await getPendingMigrations(pgClient);
		expect(pending.map((migration) => migration.tag)).toEqual([
			migrationEntry.tag,
		]);
		await applyMigration(pgClient, migrationMetadata);

		expect(client.tableExists).toBe(true);
		expect(client.applied).toContain(migrationEntry.when);
		expect(client.queries).toContain("BEGIN");
		expect(client.queries).toContain("COMMIT");
		expect(await getPendingMigrations(pgClient)).toEqual([]);
	});

	test("rolls back an interrupted first run and succeeds on retry", async () => {
		const client = new TransactionalMigrationClient();
		const pgClient = asPgClient(client);
		client.failBeforeTracking = true;

		await expect(applyMigration(pgClient, migrationMetadata)).rejects.toThrow(
			"simulated interruption before migration tracking",
		);
		expect(client.tableExists).toBe(false);
		expect(client.applied).not.toContain(migrationEntry.when);
		expect(client.queries).toContain("ROLLBACK");

		await applyMigration(pgClient, migrationMetadata);
		expect(client.tableExists).toBe(true);
		expect(client.applied).toContain(migrationEntry.when);
	});

	test("has no production caller or generic operation-table mutator", () => {
		const sourceRoot = path.join(REPO_ROOT, "server/src");
		const sourceFiles = listSourceFiles(sourceRoot);
		const callers = sourceFiles.filter((file) =>
			readFileSync(file, "utf8").includes("claimBillingOperation"),
		);
		expect(callers.map((file) => path.relative(REPO_ROOT, file))).toEqual([
			"server/src/internal/billing/operations/repos/claimBillingOperation.ts",
		]);

		const operationMutators = sourceFiles.filter((file) => {
			const source = readFileSync(file, "utf8");
			return (
				source.includes("insert(billingOperations)") ||
				source.includes("update(billingOperations)") ||
				source.includes("delete(billingOperations)")
			);
		});
		expect(
			operationMutators.map((file) => path.relative(REPO_ROOT, file)),
		).toEqual([
			"server/src/internal/billing/operations/repos/claimBillingOperation.ts",
		]);
	});

	test("is discovered by the recursive CI unit runner", () => {
		const runnerSource = readFileSync(
			path.join(REPO_ROOT, "server/tests/testRunner/runUnitTests.ts"),
			"utf8",
		);
		expect(runnerSource).toContain("files.push(...listTestFiles(full))");
		expect(import.meta.path).toContain("/server/tests/unit/db/");
	});
});
