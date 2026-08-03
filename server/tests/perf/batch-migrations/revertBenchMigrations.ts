/**
 * One-shot revert of EVERY bench migration's effects — regardless of which
 * migration or feature ran — back to the seeded state, without re-seeding:
 *   1. deletes all migration-added customer_entitlements on bench customers
 *      (seeded rows are ce_bench_* and are never touched)
 *   2. deletes all bench migration item runs
 *   3. deletes the bench org's migration runs (dashboard statuses reset)
 *
 *   bun tests/perf/batch-migrations/revertBenchMigrations.ts
 */

import { sql } from "drizzle-orm";
import {
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	getBenchContext,
} from "./utils/benchContext.js";

const main = async () => {
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;
	const customerPrefix = `${BENCH_INTERNAL_CUSTOMER_PREFIX}%`;

	const startedAt = Date.now();
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE internal_customer_id LIKE ${customerPrefix}
			AND id NOT LIKE 'ce_bench_%'
	`);
	console.log(
		`revert: deleted migration-added customer_entitlements in ${Date.now() - startedAt}ms`,
	);

	const itemRunsStarted = Date.now();
	await db.execute(
		sql`DELETE FROM migration_item_runs WHERE item_id LIKE ${customerPrefix}`,
	);
	console.log(
		`revert: deleted bench migration_item_runs in ${Date.now() - itemRunsStarted}ms`,
	);

	const runsStarted = Date.now();
	await db.execute(sql`
		DELETE FROM migration_runs
		WHERE migration_internal_id IN (
			SELECT internal_id FROM migrations
			WHERE org_id = ${org.id} AND env = ${ctx.env}
		)
	`);
	console.log(
		`revert: deleted bench migration_runs in ${Date.now() - runsStarted}ms`,
	);

	// Reclaim dead tuples so revert cycles don't degrade later claim probes.
	const vacuumStarted = Date.now();
	await db.execute(sql`VACUUM (ANALYZE) migration_item_runs`);
	await db.execute(sql`VACUUM (ANALYZE) customer_entitlements`);
	console.log(`revert: vacuumed in ${Date.now() - vacuumStarted}ms`);

	const [counts] = (await db.execute(sql`
		SELECT
			(SELECT COUNT(*) FROM customer_entitlements
				WHERE internal_customer_id LIKE ${customerPrefix}
					AND id NOT LIKE 'ce_bench_%')::bigint AS leftover_added_rows,
			(SELECT COUNT(*) FROM migration_item_runs
				WHERE item_id LIKE ${customerPrefix})::bigint AS leftover_item_runs
	`)) as Record<string, string>[];
	console.log(
		`revert: done in ${Date.now() - startedAt}ms (leftover added rows=${counts.leftover_added_rows}, leftover item runs=${counts.leftover_item_runs})`,
	);
	process.exit(0);
};

await main();
