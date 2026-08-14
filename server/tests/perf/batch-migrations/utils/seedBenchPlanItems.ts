import {
	AllowanceType,
	CusProductStatus,
	EntInterval,
	entitlements,
	products,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

export const BENCH_PLANDEL_PRODUCT_ID = "bench-plan-delete";
export const BENCH_PLANDEL_CUSTOMER_ID_PREFIX = "bench-plandel-c-";
export const BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX = "cus_bench_plandel_";
export const BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX = "cp_bench_plandel_";
export const BENCH_PLANDEL_ENTITLEMENT_PREFIX = "ce_bench_plandel_";

const APPROX_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Its own plan, so a delete never consumes the shared dataset's rows — the
 * other benches read those as their baseline. */
export const ensureBenchPlanDeleteProduct = async ({
	db,
	orgId,
	env,
	internalFeatureId,
	featureId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	internalFeatureId: string;
	featureId: string;
}): Promise<{ internalProductId: string; entitlementId: string }> => {
	const [existingProduct] = await db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.id, BENCH_PLANDEL_PRODUCT_ID),
			),
		)
		.limit(1);

	const internalProductId = existingProduct?.internal_id ?? generateId("prod");
	if (!existingProduct) {
		await db.insert(products).values({
			internal_id: internalProductId,
			id: BENCH_PLANDEL_PRODUCT_ID,
			org_id: orgId,
			env,
			name: "Bench Plan Delete",
			created_at: Date.now(),
			version: 1,
		});
	}

	const [existingEntitlement] = await db
		.select()
		.from(entitlements)
		.where(
			and(
				eq(entitlements.internal_product_id, internalProductId),
				eq(entitlements.org_id, orgId),
				eq(entitlements.internal_feature_id, internalFeatureId),
			),
		)
		.limit(1);

	const entitlementId = existingEntitlement?.id ?? generateId("ent");
	if (!existingEntitlement) {
		await db.insert(entitlements).values({
			id: entitlementId,
			created_at: Date.now(),
			org_id: orgId,
			internal_product_id: internalProductId,
			internal_feature_id: internalFeatureId,
			feature_id: featureId,
			allowance_type: AllowanceType.Fixed,
			allowance: 100,
			interval: EntInterval.Month,
			interval_count: 1,
		});
	}

	return { internalProductId, entitlementId };
};

/** Own prefixes rather than the shared seedBatchBench dataset: a delete bench
 * consumes the rows it measures, so it must be free to re-seed between runs. */
export const seedBenchPlanItems = async ({
	db,
	count,
	planInternalProductId,
	planProductId,
	entitlementId,
	internalFeatureId,
	featureId,
	startsAt,
	orgId,
	env,
}: {
	db: DrizzleCli;
	count: number;
	planInternalProductId: string;
	planProductId: string;
	entitlementId: string;
	internalFeatureId: string;
	featureId: string;
	startsAt: number;
	orgId: string;
	env: string;
}) => {
	const series = sql`GENERATE_SERIES(1, ${count}) AS i`;

	await db.execute(sql`
		INSERT INTO customers (
			internal_id, id, org_id, env, created_at, name, email
		)
		SELECT
			${BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX} || i,
			${BENCH_PLANDEL_CUSTOMER_ID_PREFIX} || i,
			${orgId},
			${env},
			${startsAt},
			'bench plandel',
			''
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, created_at, status,
			starts_at, is_custom, product_id, customer_id, options
		)
		SELECT
			${BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX} || i,
			${BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX} || i,
			${planInternalProductId},
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			false,
			${planProductId},
			${BENCH_PLANDEL_CUSTOMER_ID_PREFIX} || i,
			'{}'::jsonb[]
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id, customer_product_id, entitlement_id, internal_customer_id,
			internal_feature_id, feature_id, customer_id, unlimited, balance,
			created_at, reset_cycle_anchor, next_reset_at, usage_allowed,
			separate_interval, adjustment, additional_balance, cache_version
		)
		SELECT
			${BENCH_PLANDEL_ENTITLEMENT_PREFIX} || i,
			${BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX} || i,
			${entitlementId},
			${BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX} || i,
			${internalFeatureId},
			${featureId},
			${BENCH_PLANDEL_CUSTOMER_ID_PREFIX} || i,
			false,
			100,
			${startsAt},
			${startsAt},
			${startsAt} + ${APPROX_MONTH_MS}::bigint,
			false,
			false,
			0,
			0,
			0
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);
};
