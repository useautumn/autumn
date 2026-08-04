/** Benchmarks pooled contribution promotion strategies at 100k and 1M
 * contributions. Seeds a synthetic pool (benchpromo_ prefix), times the
 * full-recompute and delta promotion statements, cleans up. */

import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

const { db } = initDrizzle();
const POOL_ID = "benchpromo_pool";
const DUE = 1_000;
const NOW = Date.now();

const time = async (label: string, fn: () => Promise<unknown>) => {
	const start = performance.now();
	const result = await fn();
	console.log(`${label}: ${(performance.now() - start).toFixed(1)}ms`);
	return result;
};

const cleanup = async () => {
	await db.execute(
		sql`DELETE FROM pooled_balance_contributions WHERE pooled_balance_id = ${POOL_ID}`,
	);
	await db.execute(sql`DELETE FROM pooled_balances WHERE id = ${POOL_ID}`);
	await db.execute(
		sql`DELETE FROM customer_entitlements WHERE id LIKE 'benchpromo_ce_%'`,
	);
	await db.execute(sql`DROP INDEX IF EXISTS benchpromo_pending_idx`);
};

const rearmDueRows = () =>
	db.execute(sql`
		UPDATE pooled_balance_contributions SET effective_at = ${NOW - 1000}::numeric
		WHERE pooled_balance_id = ${POOL_ID}
			AND id IN (SELECT 'benchpromo_pbc_' || g.n FROM generate_series(1, ${DUE}) AS g(n))`);

// Mirrors production promoteDuePooledContributions: guarded pool_update first
// (updated_at latest vs snapshot), contribution promotion gated on it.
const fullRecomputePromotion = () =>
	db.execute(sql`
		WITH totals AS (
			SELECT
				COALESCE(SUM(CASE WHEN effective_at IS NOT NULL AND effective_at <= ${NOW}::numeric
					THEN next_cycle_contribution ELSE current_contribution END), 0) AS granted,
				COUNT(*) AS total_count,
				COUNT(*) FILTER (WHERE effective_at IS NOT NULL AND effective_at <= ${NOW}::numeric) AS due_count
			FROM pooled_balance_contributions
			WHERE pooled_balance_id = ${POOL_ID}
		),
		pool_update AS (
			UPDATE pooled_balances
			SET granted = totals.granted, updated_at = ${NOW}::numeric
			FROM totals
			WHERE pooled_balances.id = ${POOL_ID}
				AND totals.total_count > 0
				AND pooled_balances.updated_at = (
					SELECT updated_at FROM pooled_balances WHERE id = ${POOL_ID}
				)
			RETURNING pooled_balances.granted, totals.due_count
		),
		promoted AS (
			UPDATE pooled_balance_contributions
			SET current_contribution = next_cycle_contribution,
				effective_at = NULL, updated_at = ${NOW}::numeric
			WHERE pooled_balance_id = ${POOL_ID}
				AND effective_at IS NOT NULL AND effective_at <= ${NOW}::numeric
				AND EXISTS (SELECT 1 FROM pool_update)
			RETURNING id
		)
		SELECT pool_update.granted::float8 AS granted, pool_update.due_count::int AS due_count
		FROM pool_update`);

// Promote due rows + apply only the delta (bounded by due rows).
const deltaPromotion = () =>
	db.execute(sql`
		WITH due AS (
			SELECT id, current_contribution, next_cycle_contribution
			FROM pooled_balance_contributions
			WHERE pooled_balance_id = ${POOL_ID}
				AND effective_at IS NOT NULL AND effective_at <= ${NOW}::numeric
			FOR UPDATE
		),
		promoted AS (
			UPDATE pooled_balance_contributions pbc
			SET current_contribution = due.next_cycle_contribution,
				effective_at = NULL, updated_at = ${NOW}::numeric
			FROM due WHERE pbc.id = due.id
			RETURNING due.next_cycle_contribution - due.current_contribution AS delta
		)
		UPDATE pooled_balances pb
		SET granted = pb.granted + COALESCE((SELECT SUM(delta) FROM promoted), 0)
		WHERE pb.id = ${POOL_ID} AND EXISTS (SELECT 1 FROM promoted)
		RETURNING pb.granted`);

const runAtScale = async (total: number) => {
	console.log(`\n===== ${total.toLocaleString()} contributions =====`);
	await cleanup();

	const templates = await db.execute<{
		ce_id: string;
		cp_id: string;
		pool_id: string;
	}>(sql`
		SELECT pbc.source_customer_entitlement_id AS ce_id,
			pbc.source_customer_product_id AS cp_id, pb.id AS pool_id
		FROM pooled_balance_contributions pbc
		JOIN pooled_balances pb ON pb.id = pbc.pooled_balance_id
		WHERE pbc.id NOT LIKE 'benchpromo%' LIMIT 1`);
	const template = templates[0];
	if (!template) throw new Error("No pooled setup found in dev DB to clone");

	const columns = await db.execute<{ column_name: string }>(sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'customer_entitlements' AND table_schema = 'public'
		ORDER BY ordinal_position`);
	const selectList = columns
		.map(({ column_name }) => {
			if (column_name === "id") return `'benchpromo_ce_' || g.n`;
			if (
				["external_id", "pooled_contribution_id", "pooled_balance_id"].includes(
					column_name,
				)
			)
				return "NULL";
			return `ce."${column_name}"`;
		})
		.join(", ");
	const columnList = columns
		.map(({ column_name }) => `"${column_name}"`)
		.join(", ");

	await time(`seed ${total} customer_entitlements`, () =>
		db.execute(
			sql.raw(`
			INSERT INTO customer_entitlements (${columnList})
			SELECT ${selectList}
			FROM customer_entitlements ce, generate_series(1, ${total}) AS g(n)
			WHERE ce.id = '${template.ce_id}'`),
		),
	);

	await db.execute(sql`
		INSERT INTO pooled_balances (id, org_id, env, internal_customer_id, internal_feature_id,
			unlimited, granted, interval, interval_count, reset_cycle_anchor, reset_mode,
			stripe_subscription_id, customer_license_link_id, rollover_signature,
			customer_entitlement_id, last_applied_reset_at)
		SELECT ${POOL_ID}, org_id, env, internal_customer_id, internal_feature_id,
			false, ${total * 10}, interval, interval_count, 42, 'lazy',
			NULL, NULL, 'benchpromo', 'benchpromo_ce_1', NULL
		FROM pooled_balances WHERE id = ${template.pool_id}`);

	await time(`seed ${total} contributions (${DUE} due)`, () =>
		db.execute(sql`
			INSERT INTO pooled_balance_contributions (id, pooled_balance_id,
				source_customer_product_id, source_customer_entitlement_id,
				current_contribution, next_cycle_contribution, effective_at)
			SELECT 'benchpromo_pbc_' || g.n, ${POOL_ID}, ${template.cp_id},
				'benchpromo_ce_' || g.n, 10, 12,
				CASE WHEN g.n <= ${DUE} THEN ${NOW - 1000}::numeric ELSE NULL END
			FROM generate_series(1, ${total}) AS g(n)`),
	);
	await db.execute(sql`
		CREATE INDEX benchpromo_pending_idx ON pooled_balance_contributions
		(pooled_balance_id, effective_at) WHERE effective_at IS NOT NULL`);
	await db.execute(sql`ANALYZE pooled_balance_contributions`);

	await time("bare SUM over all contributions", () =>
		db.execute(sql`
			SELECT COALESCE(SUM(current_contribution), 0)::float8
			FROM pooled_balance_contributions WHERE pooled_balance_id = ${POOL_ID}`),
	);

	await time(`FULL-RECOMPUTE promotion (${DUE} due, sum over all)`, fullRecomputePromotion);
	await rearmDueRows();
	await time(`FULL-RECOMPUTE promotion again (warm cache)`, fullRecomputePromotion);
	await rearmDueRows();
	await time(`DELTA promotion (${DUE} due)`, deltaPromotion);
	await time("FULL-RECOMPUTE no-op (0 due rows)", fullRecomputePromotion);
};

try {
	await runAtScale(100_000);
	await runAtScale(1_000_000);
} catch (error) {
	console.error("BENCH FAILED:", error);
} finally {
	await time("cleanup", cleanup);
	process.exit(0);
}
