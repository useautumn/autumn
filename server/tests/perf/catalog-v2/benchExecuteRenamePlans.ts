/**
 * Worst-case timing for executeRenamePlans (one multi-CTE statement) on a
 * throwaway DEV org: 100 plan versions + reward/RC/alias refs.
 *
 *   bun tests/perf/catalog-v2/benchExecuteRenamePlans.ts
 *
 * Creates `bench-rename-txn-*`, times the CTE, then deletes the org.
 * Does not call Stripe or the catalog HTTP path.
 */

import {
	CouponDurationType,
	CusProductStatus,
	customerProducts,
	customers,
	productAliases,
	products,
	RewardTriggerEvent,
	RewardType,
	revenuecatMappings,
	rewardPrograms,
	rewards,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan.js";
import { executeRenamePlans } from "@/internal/catalogV2/execute/executeRenamePlans.js";
import { generateId } from "@/utils/genUtils.js";
import {
	createPlanRenameBenchContext,
	deleteLeftoverRenameBenchOrgs,
	deletePlanRenameBenchOrg,
	ensureProductAliasesTable,
	openPlanRenameBenchDb,
	PLAN_RENAME_BENCH_CUSTOMER_PRODUCTS,
	PLAN_RENAME_BENCH_ENV,
	PLAN_RENAME_BENCH_ORG_PREFIX,
	PLAN_RENAME_BENCH_PLAN_ID,
	PLAN_RENAME_BENCH_REWARD_PROGRAMS,
	PLAN_RENAME_BENCH_REWARDS,
	PLAN_RENAME_BENCH_TO_ID,
	PLAN_RENAME_BENCH_VERSIONS,
} from "./utils/planRenameBenchContext.js";

const EXISTING_ALIAS_ID = "pro_legacy";
const FREE_REWARD_COUNT = PLAN_RENAME_BENCH_REWARDS / 2;

const time = async <T>(label: string, fn: () => Promise<T>): Promise<{
	result: T;
	ms: number;
}> => {
	const start = performance.now();
	const result = await fn();
	const ms = performance.now() - start;
	console.log(`${label.padEnd(48)} ${ms.toFixed(1)}ms`);
	return { result, ms };
};

const countWhere = async ({
	db,
	query,
}: {
	db: ReturnType<typeof openPlanRenameBenchDb>["db"];
	query: ReturnType<typeof sql>;
}): Promise<number> => {
	const [row] = await db.execute<{ count: string }>(query);
	return Number(row?.count ?? 0);
};

const seedRenameFixture = async ({
	ctx,
}: {
	ctx: Awaited<ReturnType<typeof createPlanRenameBenchContext>>["ctx"];
}) => {
	const { db, org } = ctx;
	const env = PLAN_RENAME_BENCH_ENV;
	const now = Date.now();
	const planId = PLAN_RENAME_BENCH_PLAN_ID;

	const productRows = Array.from(
		{ length: PLAN_RENAME_BENCH_VERSIONS },
		(_, index) => ({
			internal_id: generateId("prod"),
			id: planId,
			org_id: org.id,
			env,
			name: `Pro v${index + 1}`,
			created_at: now,
			version: index + 1,
			active: index === PLAN_RENAME_BENCH_VERSIONS - 1,
		}),
	);
	await db.insert(products).values(productRows);

	const rewardRows = Array.from(
		{ length: PLAN_RENAME_BENCH_REWARDS },
		(_, index) => {
			const isFree = index < FREE_REWARD_COUNT;
			return {
				internal_id: generateId("rew"),
				id: `bench_rew_${index}`,
				org_id: org.id,
				env,
				created_at: now,
				name: `bench reward ${index}`,
				type: isFree
					? RewardType.FreeProduct
					: RewardType.PercentageDiscount,
				free_product_id: isFree ? planId : null,
				discount_config: isFree
					? null
					: {
							discount_value: 10,
							duration_type: CouponDurationType.OneOff,
							duration_value: 1,
							apply_to_all: false,
							product_ids: [planId],
						},
			};
		},
	);
	await db.insert(rewards).values(rewardRows);

	await db.insert(rewardPrograms).values(
		rewardRows.slice(0, PLAN_RENAME_BENCH_REWARD_PROGRAMS).map((reward, index) => ({
			internal_id: generateId("rp"),
			id: `bench_rp_${index}`,
			org_id: org.id,
			env,
			created_at: now,
			internal_reward_id: reward.internal_id,
			product_ids: [planId],
			when: RewardTriggerEvent.Checkout,
			max_redemptions: 1,
			unlimited_redemptions: false,
			exclude_trial: false,
		})),
	);

	// PK is (org_id, env, autumn_product_id) — one row per plan is the max legal.
	await db.insert(revenuecatMappings).values({
		org_id: org.id,
		env,
		autumn_product_id: planId,
		revenuecat_product_ids: [`rc_${planId}`],
	});

	await db.insert(productAliases).values({
		org_id: org.id,
		env,
		alias_id: EXISTING_ALIAS_ID,
		canonical_plan_id: planId,
		created_at: now,
	});

	const cpTargets = productRows.slice(0, PLAN_RENAME_BENCH_CUSTOMER_PRODUCTS);
	for (const [index, product] of cpTargets.entries()) {
		const internalCustomerId = generateId("cus");
		await db.insert(customers).values({
			internal_id: internalCustomerId,
			id: `bench_rename_cus_${index}`,
			org_id: org.id,
			env,
			created_at: now,
			name: `bench rename cus ${index}`,
			email: `bench-rename-${index}@test.com`,
		});
		await db.insert(customerProducts).values({
			id: generateId("cus_prod"),
			internal_customer_id: internalCustomerId,
			product_id: planId,
			internal_product_id: product.internal_id,
			status: CusProductStatus.Active,
			created_at: now,
			starts_at: now,
			quantity: 1,
			options: [],
			is_custom: false,
		});
	}

	const seeded = {
		products: productRows.length,
		rewards: rewardRows.length,
		rewardPrograms: PLAN_RENAME_BENCH_REWARD_PROGRAMS,
		revenuecatMappings: 1,
		productAliases: 1,
		customers: cpTargets.length,
		customerProducts: cpTargets.length,
	};
	return { seeded, productInternalIds: productRows.map((row) => row.internal_id) };
};

const verifyRename = async ({
	ctx,
}: {
	ctx: Awaited<ReturnType<typeof createPlanRenameBenchContext>>["ctx"];
}) => {
	const { db, org } = ctx;
	const orgId = org.id;
	const env = PLAN_RENAME_BENCH_ENV;
	const fromId = PLAN_RENAME_BENCH_PLAN_ID;
	const toId = PLAN_RENAME_BENCH_TO_ID;

	const productCount = await countWhere({
		db,
		query: sql`
			SELECT count(*)::text AS count FROM products
			WHERE org_id = ${orgId} AND env = ${env} AND id = ${toId}
		`,
	});
	const leftoverProducts = await countWhere({
		db,
		query: sql`
			SELECT count(*)::text AS count FROM products
			WHERE org_id = ${orgId} AND env = ${env} AND id = ${fromId}
		`,
	});
	const rewardProgramsUpdated = await countWhere({
		db,
		query: sql`
			SELECT count(*)::text AS count FROM reward_programs
			WHERE org_id = ${orgId} AND env = ${env}
				AND ${toId} = ANY(product_ids)
		`,
	});
	const rewardsUpdated = await countWhere({
		db,
		query: sql`
			SELECT count(*)::text AS count FROM rewards
			WHERE org_id = ${orgId} AND env = ${env}
				AND (
					free_product_id = ${toId}
					OR discount_config -> 'product_ids' ? ${toId}
				)
		`,
	});
	const rcUpdated = await countWhere({
		db,
		query: sql`
			SELECT count(*)::text AS count FROM revenuecat_mappings
			WHERE org_id = ${orgId} AND env = ${env}
				AND autumn_product_id = ${toId}
		`,
	});
	const aliasRows = await db
		.select()
		.from(productAliases)
		.where(
			and(eq(productAliases.org_id, orgId), eq(productAliases.env, env)),
		);
	const cpUnchanged = await countWhere({
		db,
		query: sql`
			SELECT count(*)::text AS count FROM customer_products
			WHERE product_id = ${fromId}
				AND internal_customer_id IN (
					SELECT internal_id FROM customers WHERE org_id = ${orgId}
				)
		`,
	});

	if (productCount !== PLAN_RENAME_BENCH_VERSIONS || leftoverProducts !== 0) {
		throw new Error(
			`products: expected ${PLAN_RENAME_BENCH_VERSIONS} at ${toId}, got ${productCount} (leftover ${fromId}=${leftoverProducts})`,
		);
	}
	if (rewardProgramsUpdated !== PLAN_RENAME_BENCH_REWARD_PROGRAMS) {
		throw new Error(
			`reward_programs: expected ${PLAN_RENAME_BENCH_REWARD_PROGRAMS} updated, got ${rewardProgramsUpdated}`,
		);
	}
	if (rewardsUpdated !== PLAN_RENAME_BENCH_REWARDS) {
		throw new Error(
			`rewards: expected ${PLAN_RENAME_BENCH_REWARDS} updated, got ${rewardsUpdated}`,
		);
	}
	if (rcUpdated !== 1) {
		throw new Error(`revenuecat_mappings: expected 1 updated, got ${rcUpdated}`);
	}
	if (
		aliasRows.length !== 1 ||
		aliasRows[0]?.alias_id !== fromId ||
		aliasRows[0]?.canonical_plan_id !== toId
	) {
		throw new Error(
			`product_aliases: expected ${fromId}→${toId}, got ${JSON.stringify(aliasRows)}`,
		);
	}
	if (cpUnchanged !== PLAN_RENAME_BENCH_CUSTOMER_PRODUCTS) {
		throw new Error(
			`customer_products.product_id should stay ${fromId} (${PLAN_RENAME_BENCH_CUSTOMER_PRODUCTS} rows), got ${cpUnchanged}`,
		);
	}

	return {
		productsRenamed: productCount,
		rewardProgramsUpdated,
		rewardsUpdated,
		revenuecatMappingsUpdated: rcUpdated,
		aliasAfter: `${aliasRows[0].alias_id}→${aliasRows[0].canonical_plan_id}`,
		customerProductsUnchanged: cpUnchanged,
	};
};

const main = async () => {
	const { db, client } = openPlanRenameBenchDb();
	const orgSlug = `${PLAN_RENAME_BENCH_ORG_PREFIX}${Date.now()}`;
	let orgId: string | undefined;

	try {
		await deleteLeftoverRenameBenchOrgs({ db });
		await ensureProductAliasesTable({ db });

		const { ctx, org } = await createPlanRenameBenchContext({ db, orgSlug });
		orgId = org.id;
		console.log(`bench: org ${org.slug} (${org.id}) env=${PLAN_RENAME_BENCH_ENV}`);

		const { seeded } = await seedRenameFixture({ ctx });
		console.log("seeded:", JSON.stringify(seeded, null, 2));
		console.log(
			"revenuecat_mappings: seeded 1 (PK is org_id+env+autumn_product_id — 10 rows per plan is illegal)",
		);

		await db.execute(sql`SELECT 1`);

		const { ms: renameMs } = await time(
			"executeRenamePlans (one CTE statement)",
			() =>
				executeRenamePlans({
					ctx,
					updateCatalogPlan: {
						renamePlans: [
							{
								planId: PLAN_RENAME_BENCH_PLAN_ID,
								toId: PLAN_RENAME_BENCH_TO_ID,
							},
						],
					} as UpdateCatalogPlan,
				}),
		);

		const verified = await verifyRename({ ctx });

		console.log(
			JSON.stringify(
				{
					renameMs: Number(renameMs.toFixed(1)),
					oneStatement: true,
					seeded,
					verified,
					planId: PLAN_RENAME_BENCH_PLAN_ID,
					toId: PLAN_RENAME_BENCH_TO_ID,
				},
				null,
				2,
			),
		);
	} finally {
		if (db && orgId) {
			console.log("tearing down bench org…");
			await deletePlanRenameBenchOrg({ db, orgId });
		}
		if (db) {
			await deleteLeftoverRenameBenchOrgs({ db });
		}
		await client?.end();
	}

	process.exit(0);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
