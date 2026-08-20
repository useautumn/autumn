/**
 * Compares the two shapes of the license `add` candidate select — today's
 * license_entitlements/entitlements/features join tree vs projecting the
 * entitlement the op already holds as literals — against a candidate-bearing
 * state, then rolls back.
 *
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeLicenseAddCandidates.ts
 */

import { EntInterval, MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import { canonicalPoolLateralSql } from "@/internal/migrations/v2/batchOperations/actions/licensePoolSql.js";
import { cycleAnchorSourcesSql } from "@/internal/migrations/v2/batchOperations/actions/utils/cycleAnchorSql.js";
import {
	buildOperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { getBenchContext } from "../utils/benchContext.js";
import {
	BENCH_VERSET_PRODUCT_PREFIX,
	ensureBenchVersionSetCatalog,
} from "../utils/benchVersionSetCatalog.js";
import { BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX } from "../utils/seedBenchVersionSet.js";

const parseArgs = () => {
	const args = process.argv.slice(2);
	const index = args.indexOf("--page-size");
	return { pageSize: Number(index === -1 ? "2000" : args[index + 1]) };
};

type Target = {
	entitlementId: string;
	internalFeatureId: string;
	featureId: string;
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
	const [license] = catalog.licenses;
	const scope = buildOperationScope({
		internalProductId: catalog.v1InternalProductId,
	});
	const prefix = `${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX}%`;

	const [target] = await db.execute<{
		entitlement_id: string;
		internal_feature_id: string;
		feature_id: string;
	}>(sql`
		SELECT le.entitlement_id, e.internal_feature_id, f.id AS feature_id
		FROM customer_licenses AS pool
		INNER JOIN license_entitlements AS le
			ON le.plan_license_id = pool.plan_license_id
		INNER JOIN entitlements AS e ON e.id = le.entitlement_id
		INNER JOIN features AS f ON f.internal_id = e.internal_feature_id
		WHERE pool.internal_customer_id LIKE ${prefix}
			AND e.internal_product_id LIKE ${`${BENCH_VERSET_PRODUCT_PREFIX}%`}
			AND e.interval = ${EntInterval.Month}
		LIMIT 1
	`);
	if (!target) {
		console.error("probe: no monthly license entitlement reachable — seed first");
		process.exit(1);
	}
	const resolved: Target = {
		entitlementId: target.entitlement_id,
		internalFeatureId: target.internal_feature_id,
		featureId: target.feature_id,
	};
	console.log(
		`probe: target ${resolved.entitlementId} feature ${resolved.featureId}`,
	);

	const pageCustomers = (
		await db.execute<{ internal_id: string }>(sql`
			SELECT internal_id FROM customers
			WHERE internal_id LIKE ${prefix}
			ORDER BY internal_id
			LIMIT ${pageSize}
		`)
	).map((row) => row.internal_id);

	const anchors = cycleAnchorSourcesSql({
		include: true,
		customerProductId: sql`assignment.id`,
		subscriptionIds: sql`cp.subscription_ids`,
		targetInterval: String(EntInterval.Month),
		targetIntervalCount: 1,
		keepLiveRowAnchor: false,
	});

	const dedupe = sql`
		AND NOT EXISTS (
			SELECT 1
			FROM customer_entitlements AS existing
			INNER JOIN entitlements AS existing_definition
				ON existing_definition.id = existing.entitlement_id
			WHERE existing.customer_product_id = assignment.id
				AND existing.internal_feature_id = ${resolved.internalFeatureId}
				AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${String(EntInterval.Month)}
				AND COALESCE(existing_definition.interval_count, 1) = 1
		)`;

	// Today: three joins re-derive the entitlement, then filter on e.id.
	const joinedVariant = {
		label: "current — license_entitlements → entitlements → features joins",
		join: sql`
			INNER JOIN license_entitlements AS le
				ON le.plan_license_id = pool.plan_license_id
			INNER JOIN entitlements AS e
				ON e.id = le.entitlement_id
			INNER JOIN features AS f
				ON f.internal_id = e.internal_feature_id`,
		columns: sql`e.id AS "entitlementId", e.internal_feature_id AS "internalFeatureId", f.id AS "featureId"`,
		where: sql`AND e.id = ${resolved.entitlementId} ${dedupe}`,
	};

	// Proposed: literals like the replace branch, guard demoted to an EXISTS on
	// the unique (plan_license_id, entitlement_id) index.
	const literalVariant = {
		label: "proposed — literals + EXISTS guard",
		join: sql``,
		columns: sql`${resolved.entitlementId} AS "entitlementId", ${resolved.internalFeatureId} AS "internalFeatureId", ${resolved.featureId} AS "featureId"`,
		where: sql`
			AND EXISTS (
				SELECT 1
				FROM license_entitlements AS le
				WHERE le.plan_license_id = pool.plan_license_id
					AND le.entitlement_id = ${resolved.entitlementId}
			)
			${dedupe}`,
	};

	const explain = (variant: typeof joinedVariant) => sql`
		EXPLAIN (ANALYZE, BUFFERS, VERBOSE false)
		SELECT
			assignment.id AS "customerProductId",
			assignment.internal_customer_id AS "internalCustomerId",
			customer.id AS "customerId",
			entity.id AS "entityId",
			${variant.columns},
			assignment.status AS "status",
			COALESCE(cp.starts_at, assignment.starts_at) AS "startsAt",
			${anchors.paidRecurringColumn} AS "isPaidRecurring",
			${anchors.subscriptionAnchorColumn} AS "subscriptionCycleAnchor",
			${anchors.siblingAnchorColumn} AS "siblingResetCycleAnchor"
		FROM customer_products AS assignment
		${canonicalPoolLateralSql({ licensePlanId: license.licensePlanId, columns: sql`pool.*` })}
		INNER JOIN customer_products AS cp
			ON cp.id = pool.parent_customer_product_id
		${variant.join}
		INNER JOIN customers AS customer
			ON customer.internal_id = assignment.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = assignment.internal_entity_id
		${anchors.siblingJoin}
		${anchors.subscriptionJoin}
		WHERE assignment.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
			AND assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND ${operationScopeSql({ scope })}
			${variant.where}
		ORDER BY assignment.id
		LIMIT 10000
	`;

	// How many rows the dedupe's idx_ce_internal_feature_id scan can walk per
	// candidate — the arithmetic that decides whether an index is the fix.
	const [featureRows] = await db.execute<{ count: string }>(sql`
		SELECT count(*) AS count FROM customer_entitlements
		WHERE internal_feature_id = ${resolved.internalFeatureId}
	`);
	console.log(
		`probe: customer_entitlements rows sharing internal_feature_id=${resolved.internalFeatureId}: ${featureRows.count}`,
	);

	await db.transaction(async (tx) => {
		// The prior run repointed parents to v2, so the operation scope matches
		// nothing; put them back on v1 to recreate the pre-migration state.
		const restored = await tx.execute(sql`
			UPDATE customer_products
			SET internal_product_id = ${catalog.v1InternalProductId}
			WHERE internal_customer_id LIKE ${prefix}
				AND internal_entity_id IS NULL
			RETURNING id
		`);
		// Make every seat a candidate, the state the real add op selects against.
		const cleared = await tx.execute(sql`
			DELETE FROM customer_entitlements AS existing
			USING customer_products AS assignment
			WHERE existing.customer_product_id = assignment.id
				AND assignment.internal_customer_id LIKE ${prefix}
				AND assignment.internal_entity_id IS NOT NULL
				AND existing.internal_feature_id = ${resolved.internalFeatureId}
			RETURNING existing.id
		`);
		console.log(
			`probe: restored ${restored.rows.length} parents to v1, cleared ${cleared.rows.length} seat rows (rolled back after)\n`,
		);

		for (const variant of [joinedVariant, literalVariant]) {
			const plan = await tx.execute(explain(variant));
			console.log(`── ${variant.label} ──`);
			for (const row of plan.rows as Record<string, string>[]) {
				const line = Object.values(row)[0];
				if (/Execution Time|Planning Time|rows=|Seq Scan|Index|Nested Loop|Sort|Hash|Memoize|Buffers: shared/.test(line))
					console.log(line);
			}
			console.log("");
		}

		tx.rollback();
	}).catch((error) => {
		if (!String(error).includes("Rollback")) throw error;
	});

	process.exit(0);
};

await main();
