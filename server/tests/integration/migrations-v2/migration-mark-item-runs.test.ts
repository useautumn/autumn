import { describe, expect, test } from "bun:test";
import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { normalizeDbExecute } from "@/db/initDrizzle.js";
import { markPageItemRuns } from "@/internal/migrations/v2/batchOperations/execute/claim/markPageItemRuns.js";
import {
	migrationTestDatabaseUrl,
	withScratchSchema,
} from "./utils/scratchDatabase.js";

const databaseUrl = migrationTestDatabaseUrl();
const changes = JSON.stringify([{ kind: "license_pool_repointed" }]);

describe.skipIf(!databaseUrl)("migration mark item runs", () => {
	test("a refused customer stays skipped even when an earlier op recorded changes", async () => {
		await withScratchSchema({
			databaseUrl: databaseUrl as string,
			run: async ({ options }) => {
				const pool = new pg.Pool({ connectionString: databaseUrl, options });
				const db = normalizeDbExecute(drizzle(pool, { schema: schemas }));
				try {
					await pool.query(`CREATE TABLE migration_item_runs (
						migration_internal_id text, migration_run_id text,
						item_kind text, item_id text, status text, skip_reason text,
						dry_run boolean, unpublished_changes jsonb, updated_at bigint
					)`);
					await pool.query(
						`INSERT INTO migration_item_runs VALUES
						 ('migration_123', 'run_1', 'customer', 'customer_changed', 'running', NULL, false, $1, 0),
						 ('migration_123', 'run_1', 'customer', 'customer_refused', 'running', NULL, false, $1, 0),
						 ('migration_123', 'run_1', 'customer', 'customer_converged', 'running', NULL, false, NULL, 0),
						 ('migration_123', 'run_1', 'customer', 'customer_unmatched', 'running', NULL, false, NULL, 0)`,
						[changes],
					);

					const { succeededInternalCustomerIds } = await markPageItemRuns({
						db,
						migrationInternalId: "migration_123",
						migrationRunId: "run_1",
						internalCustomerIds: [
							"customer_changed",
							"customer_refused",
							"customer_converged",
							"customer_unmatched",
						],
						excludedInternalCustomerIds: ["customer_refused"],
						noUpdatesNeededInternalCustomerIds: ["customer_converged"],
					});

					expect([...succeededInternalCustomerIds]).toEqual([
						"customer_changed",
					]);
					const { rows } = await pool.query(
						`SELECT item_id, status, skip_reason, unpublished_changes IS NOT NULL AS pending
						FROM migration_item_runs ORDER BY item_id`,
					);
					expect(rows).toEqual([
						{
							item_id: "customer_changed",
							status: "succeeded",
							skip_reason: null,
							pending: true,
						},
						{
							item_id: "customer_converged",
							status: "skipped",
							skip_reason: "no_updates_needed",
							pending: false,
						},
						{
							item_id: "customer_refused",
							status: "skipped",
							skip_reason: "ineligible",
							pending: true,
						},
						{
							item_id: "customer_unmatched",
							status: "skipped",
							skip_reason: "ineligible",
							pending: false,
						},
					]);
				} finally {
					await pool.end();
				}
			},
		});
	});
});
