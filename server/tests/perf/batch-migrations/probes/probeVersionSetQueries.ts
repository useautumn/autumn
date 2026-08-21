/**
 * EXPLAIN (ANALYZE, BUFFERS) the queries a version SET drives, against the
 * seeded-but-not-yet-migrated bench-verset rows. Seed first:
 *
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/benchRunVersionSet.ts --customers 200000 --pages 0
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeVersionSetQueries.ts
 *
 * The SELECT skeletons mirror production; every non-trivial predicate is
 * imported from the production builders so a plan here is a plan there. The
 * repoint UPDATE is analyzed inside a rolled-back transaction.
 */

import { EntInterval } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	canonicalPoolOrderingSql,
	poolLicensePlanSql,
} from "@/internal/migrations/v2/batchOperations/actions/licensePoolSql.js";
import { cycleAnchorSourcesSql } from "@/internal/migrations/v2/batchOperations/actions/utils/cycleAnchorSql.js";
import { rowIsUnpaidSql } from "@/internal/migrations/v2/batchOperations/actions/utils/rowIsUnpaidSql.js";
import {
	buildOperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { getBenchContext } from "../utils/benchContext.js";
import {
	BENCH_VERSET_DELETED_FEATURES,
	BENCH_VERSET_REPLACED_FEATURES,
	ensureBenchVersionSetCatalog,
} from "../utils/benchVersionSetCatalog.js";
import { BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX } from "../utils/seedBenchVersionSet.js";

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	return { pageSize: Number(get("--page-size") ?? "5000") };
};

/** Drizzle hands back a bare row array or a QueryResult depending on driver. */
const printPlan = async ({ title, plan }: { title: string; plan: unknown }) => {
	const rows = (
		Array.isArray(plan) ? plan : ((plan as { rows?: unknown[] }).rows ?? [])
	) as Record<string, string>[];
	console.log("");
	console.log(`── ${title} ${"─".repeat(Math.max(58 - title.length, 0))}`);
	for (const row of rows) {
		console.log(Object.values(row)[0]);
	}
};

const main = async () => {
	const { pageSize } = parseArgs();
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;

	const catalog = await ensureBenchVersionSetCatalog({
		db,
		orgId: org.id,
		env: ctx.env,
		features: ctx.features,
	});
	const scope = buildOperationScope({
		internalProductId: catalog.v1InternalProductId,
	});

	const pageCustomers = (
		await db.execute<{ internal_id: string }>(sql`
			SELECT internal_id FROM customers
			WHERE internal_id LIKE ${`${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX}%`}
			ORDER BY internal_id
			LIMIT ${pageSize}
		`)
	).map((row) => row.internal_id);

	if (pageCustomers.length === 0) {
		console.error(
			"probe: no bench-verset customers seeded — run benchRunVersionSet.ts --pages 0 first",
		);
		process.exit(1);
	}
	console.log(
		`probe: page of ${pageCustomers.length.toLocaleString()} customers, scope ${catalog.v1InternalProductId}`,
	);

	const removeEntitlementIds = BENCH_VERSET_DELETED_FEATURES.map((featureId) =>
		catalog.v1EntitlementIdsByFeature.get(featureId),
	).filter((id): id is string => Boolean(id));
	const fromEntitlementIds = BENCH_VERSET_REPLACED_FEATURES.map((featureId) =>
		catalog.v1EntitlementIdsByFeature.get(featureId),
	).filter((id): id is string => Boolean(id));

	await printPlan({
		title: "remove candidate select (rollover + unpaid guards)",
		plan: await db.execute(sql`
			EXPLAIN (ANALYZE, BUFFERS)
			SELECT cp.id, cp.internal_customer_id, entity.id, cp.status
			FROM customer_products AS cp
			LEFT JOIN entities AS entity
				ON entity.internal_id = cp.internal_entity_id
			WHERE cp.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
				AND ${operationScopeSql({ scope })}
				AND EXISTS (
					SELECT 1
					FROM customer_entitlements AS existing
					INNER JOIN entitlements AS definition
						ON definition.id = existing.entitlement_id
					WHERE existing.customer_product_id = cp.id
						AND existing.entitlement_id IN (${sqlList({ values: removeEntitlementIds })})
						AND definition.pooled IS NOT TRUE
						AND NOT existing.is_pooled_balance
						AND existing.pooled_contribution_id IS NULL
						AND NOT EXISTS (
							SELECT 1 FROM rollovers WHERE rollovers.cus_ent_id = existing.id
						)
						AND ${rowIsUnpaidSql({
							customerProductId: sql`cp.id`,
							entitlementId: sql`existing.entitlement_id`,
						})}
				)
			ORDER BY cp.id
			LIMIT ${pageSize}
		`),
	});

	const anchors = cycleAnchorSourcesSql({
		include: true,
		customerProductId: sql`cp.id`,
		subscriptionIds: sql`cp.subscription_ids`,
		targetInterval: String(EntInterval.Month),
		targetIntervalCount: 1,
		keepLiveRowAnchor: true,
	});

	await printPlan({
		title: "replace candidate select (anchor ladder + unpaid guard)",
		plan: await db.execute(sql`
			EXPLAIN (ANALYZE, BUFFERS)
			SELECT
				live.id,
				cp.id,
				cp.internal_customer_id,
				customer.id,
				entity.id,
				${anchors.paidRecurringColumn} AS is_paid_recurring,
				${anchors.subscriptionAnchorColumn} AS subscription_anchor,
				${anchors.siblingAnchorColumn} AS sibling_anchor,
				live.balance,
				live.next_reset_at
			FROM customer_products AS cp
			INNER JOIN customer_entitlements AS live
				ON live.customer_product_id = cp.id
				AND live.entitlement_id IN (${sqlList({ values: fromEntitlementIds })})
			INNER JOIN customers AS customer
				ON customer.internal_id = cp.internal_customer_id
			LEFT JOIN entities AS entity
				ON entity.internal_id = cp.internal_entity_id
			${anchors.siblingJoin}
			${anchors.subscriptionJoin}
			WHERE cp.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
				AND ${operationScopeSql({ scope })}
				AND ${rowIsUnpaidSql({
					customerProductId: sql`cp.id`,
					entitlementId: sql`live.entitlement_id`,
				})}
			ORDER BY cp.id
			LIMIT ${pageSize}
		`),
	});

	// EXPLAIN ANALYZE executes, so the repoint runs inside a transaction the
	// probe always aborts.
	try {
		await db.transaction(async (tx) => {
			const plan = await tx.execute(sql`
				EXPLAIN (ANALYZE, BUFFERS)
				WITH candidate_rows AS MATERIALIZED (
					SELECT cp.id AS customer_product_id
					FROM customer_products AS cp
					LEFT JOIN entities AS entity
						ON entity.internal_id = cp.internal_entity_id
					WHERE cp.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
						AND ${operationScopeSql({ scope })}
					FOR UPDATE OF cp
				),
				updated AS (
					UPDATE customer_products AS cp
					SET internal_product_id = ${catalog.v2InternalProductId}
					FROM candidate_rows AS candidate
					WHERE cp.id = candidate.customer_product_id
					RETURNING cp.id
				)
				SELECT candidate.*
				FROM candidate_rows AS candidate
				INNER JOIN updated ON updated.id = candidate.customer_product_id
				ORDER BY candidate.customer_product_id
			`);
			await printPlan({
				title: "repoint customer products UPDATE (rolled back)",
				plan,
			});
			throw new Error("probe: intentional rollback");
		});
	} catch (error) {
		if (!(error instanceof Error && error.message.includes("intentional"))) {
			throw error;
		}
		console.log("probe: repoint transaction rolled back");
	}

	const [license] = catalog.licenses;
	try {
		await db.transaction(async (tx) => {
			const plan = await tx.execute(sql`
				EXPLAIN (ANALYZE, BUFFERS)
				UPDATE customer_licenses AS pool
				SET
					plan_license_id = ${license.v2PlanLicenseId},
					granted = target.included + pool.paid_quantity,
					remaining = GREATEST(
						pool.remaining + ((target.included + pool.paid_quantity) - pool.granted),
						0
					),
					updated_at = ${Date.now()}
				FROM customer_products AS cp, plan_license AS target
				WHERE cp.id = pool.parent_customer_product_id
					AND target.id = ${license.v2PlanLicenseId}
					AND ${poolLicensePlanSql({ licensePlanId: license.licensePlanId })}
					AND pool.plan_license_id IS DISTINCT FROM ${license.v2PlanLicenseId}
					AND cp.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
					AND ${operationScopeSql({ scope })}
					AND pool.id = (
						SELECT live.id
						FROM customer_licenses AS live
						JOIN customer_products AS live_parent
							ON live_parent.id = live.parent_customer_product_id
						WHERE live.link_id = pool.link_id
							AND ${poolLicensePlanSql({
								licensePlanId: license.licensePlanId,
								poolAlias: sql`live`,
							})}
						${canonicalPoolOrderingSql({
							parentAlias: sql`live_parent`,
							poolAlias: sql`live`,
						})}
						LIMIT 1
					)
				RETURNING cp.internal_customer_id
			`);
			await printPlan({
				title: "license pool repoint UPDATE (rolled back)",
				plan,
			});
			throw new Error("probe: intentional rollback");
		});
	} catch (error) {
		if (!(error instanceof Error && error.message.includes("intentional"))) {
			throw error;
		}
		console.log("probe: pool repoint transaction rolled back");
	}

	process.exit(0);
};

await main();
