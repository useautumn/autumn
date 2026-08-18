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

export type BenchPlanItemPrefixes = {
	productId: string;
	customerId: string;
	internalCustomer: string;
	customerProduct: string;
	entitlement: string;
};

export const BENCH_PLANDEL_PREFIXES: BenchPlanItemPrefixes = {
	productId: "bench-plan-delete",
	customerId: "bench-plandel-c-",
	internalCustomer: "cus_bench_plandel_",
	customerProduct: "cp_bench_plandel_",
	entitlement: "ce_bench_plandel_",
};

export const BENCH_PLANREP_PREFIXES: BenchPlanItemPrefixes = {
	productId: "bench-plan-replace",
	customerId: "bench-planrep-c-",
	internalCustomer: "cus_bench_planrep_",
	customerProduct: "cp_bench_planrep_",
	entitlement: "ce_bench_planrep_",
};

export const BENCH_PLANDEL_PRODUCT_ID = BENCH_PLANDEL_PREFIXES.productId;
export const BENCH_PLANDEL_CUSTOMER_ID_PREFIX =
	BENCH_PLANDEL_PREFIXES.customerId;
export const BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX =
	BENCH_PLANDEL_PREFIXES.internalCustomer;
export const BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX =
	BENCH_PLANDEL_PREFIXES.customerProduct;
export const BENCH_PLANDEL_ENTITLEMENT_PREFIX =
	BENCH_PLANDEL_PREFIXES.entitlement;

const APPROX_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Isolated catalog plan so a delete/replace never consumes the shared
 * seedBatchBench rows the other benches treat as baseline. */
export const ensureBenchPlanItemProduct = async ({
	db,
	orgId,
	env,
	internalFeatureId,
	featureId,
	productId,
	name,
	allowance = 100,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	internalFeatureId: string;
	featureId: string;
	productId: string;
	name: string;
	allowance?: number;
}): Promise<{ internalProductId: string; entitlementId: string }> => {
	const [existingProduct] = await db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.id, productId),
			),
		)
		.limit(1);

	const internalProductId = existingProduct?.internal_id ?? generateId("prod");
	if (!existingProduct) {
		await db.insert(products).values({
			internal_id: internalProductId,
			id: productId,
			org_id: orgId,
			env,
			name,
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
			allowance,
			interval: EntInterval.Month,
			interval_count: 1,
		});
	}

	return { internalProductId, entitlementId };
};

export const ensureBenchPlanDeleteProduct = ({
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
}) =>
	ensureBenchPlanItemProduct({
		db,
		orgId,
		env,
		internalFeatureId,
		featureId,
		productId: BENCH_PLANDEL_PREFIXES.productId,
		name: "Bench Plan Delete",
	});

/** Own prefixes rather than the shared seedBatchBench dataset: a delete or
 * replace bench mutates the rows it measures, so it must re-seed freely. */
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
	prefixes = BENCH_PLANDEL_PREFIXES,
	balance = 100,
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
	prefixes?: BenchPlanItemPrefixes;
	balance?: number;
}) => {
	const series = sql`GENERATE_SERIES(1, ${count}) AS i`;

	await db.execute(sql`
		INSERT INTO customers (
			internal_id, id, org_id, env, created_at, name, email
		)
		SELECT
			${prefixes.internalCustomer} || i,
			${prefixes.customerId} || i,
			${orgId},
			${env},
			${startsAt},
			'bench plan item',
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
			${prefixes.customerProduct} || i,
			${prefixes.internalCustomer} || i,
			${planInternalProductId},
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			false,
			${planProductId},
			${prefixes.customerId} || i,
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
			${prefixes.entitlement} || i,
			${prefixes.customerProduct} || i,
			${entitlementId},
			${prefixes.internalCustomer} || i,
			${internalFeatureId},
			${featureId},
			${prefixes.customerId} || i,
			false,
			${balance},
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
