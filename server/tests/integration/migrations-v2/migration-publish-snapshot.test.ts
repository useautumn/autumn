import { describe, expect, test } from "bun:test";
import { type MigrationItemChange, schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { normalizeDbExecute } from "@/db/initDrizzle.js";
import { clearPublishedItemRunChanges } from "@/internal/migrations/v2/batchOperations/execute/claim/clearPublishedItemRunChanges.js";
import {
	migrationTestDatabaseUrl,
	withScratchSchema,
} from "./utils/scratchDatabase.js";

const databaseUrl = migrationTestDatabaseUrl();
const oldChanges: MigrationItemChange[] = [{ kind: "license_pool_repointed" }];
const addedChange: MigrationItemChange = { kind: "license_pool_repointed" };

describe.skipIf(!databaseUrl)("migration publish snapshot", () => {
	test("a stale publisher cannot clear changes appended by a retry", async () => {
		await withScratchSchema({
			databaseUrl: databaseUrl as string,
			run: async ({ options }) => {
				const pool = new pg.Pool({ connectionString: databaseUrl, options });
				const db = normalizeDbExecute(drizzle(pool, { schema: schemas }));
				try {
					await pool.query(`CREATE TABLE migration_item_runs (
						migration_internal_id text, migration_run_id text,
						item_kind text, item_id text, status text, dry_run boolean,
						unpublished_changes jsonb
					)`);
					await pool.query(
						`INSERT INTO migration_item_runs VALUES
						 ('migration_123', 'old_run', 'customer', 'customer_123', 'skipped', false, $1),
						 ('migration_123', 'old_run', 'customer', 'customer_control', 'succeeded', false, $1)`,
						[JSON.stringify(oldChanges)],
					);
					const readPending = async () =>
						(
							await pool.query(`SELECT item_id, migration_run_id, unpublished_changes
							FROM migration_item_runs WHERE unpublished_changes IS NOT NULL
							ORDER BY item_id`)
						).rows as {
							item_id: string;
							migration_run_id: string;
							unpublished_changes: MigrationItemChange[];
						}[];
					const oldSnapshot = await readPending();
					await pool.query(
						`UPDATE migration_item_runs
						SET migration_run_id = 'retry_run', status = 'succeeded',
						 unpublished_changes = unpublished_changes || $1::jsonb
						WHERE item_id = 'customer_123'`,
						[JSON.stringify([addedChange])],
					);

					const clear = (snapshot: Awaited<ReturnType<typeof readPending>>) => {
						const args = {
							db,
							migrationInternalId: "migration_123",
							internalCustomerIds: snapshot.map((row) => row.item_id),
							publishedSnapshots: snapshot.map((row) => ({
								internalCustomerId: row.item_id,
								migrationRunId: row.migration_run_id,
								changes: row.unpublished_changes,
							})),
						};
						return clearPublishedItemRunChanges(args);
					};
					await clear(oldSnapshot);
					const nextPublish = await readPending();
					expect(nextPublish).toEqual([
						{
							item_id: "customer_123",
							migration_run_id: "retry_run",
							unpublished_changes: [...oldChanges, addedChange],
						},
					]);
					await clear(nextPublish);
					expect(await readPending()).toEqual([]);
				} finally {
					await pool.end();
				}
			},
		});
	});
});
