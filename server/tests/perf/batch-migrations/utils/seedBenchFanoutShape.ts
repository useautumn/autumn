import {
	AllowanceType,
	CusProductStatus,
	EntInterval,
	type Feature,
	entitlements,
	products,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

export type BenchFanoutShapePrefixes = {
	productId: string;
	customerId: string;
	internalCustomer: string;
	customerProduct: string;
	entitlement: string;
	catalogEntitlement: string;
};

export const BENCH_FANOUT_PREFIXES: BenchFanoutShapePrefixes = {
	productId: "bench-fanout-shape",
	customerId: "bench-fanout-c-",
	internalCustomer: "cus_bench_fanout_",
	customerProduct: "cp_bench_fanout_",
	entitlement: "ce_bench_fanout_",
	catalogEntitlement: "ent_bench_fanout_",
};

export const FANOUT_SHAPE_FROM_INCLUDED = 100;
export const FANOUT_SHAPE_TO_INCLUDED = 200;

/** Same included, distinct consumption — a swapped write fails the balance check. */
export const FANOUT_SHAPE_FEATURES = [
	{ featureId: TestFeature.Messages, consumed: 10 },
	{ featureId: TestFeature.Words, consumed: 20 },
	{ featureId: TestFeature.Credits, consumed: 30 },
	{ featureId: TestFeature.Credits2, consumed: 40 },
	{ featureId: TestFeature.Credits3, consumed: 50 },
	{ featureId: TestFeature.Storage, consumed: 60 },
] as const;

export type FanoutShapeFeatureSpec = (typeof FANOUT_SHAPE_FEATURES)[number] & {
	internalFeatureId: string;
	entitlementId: string;
	startingBalance: number;
	expectedBalance: number;
};

const APPROX_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const catalogEntitlementIdFor = ({
	featureId,
	prefixes = BENCH_FANOUT_PREFIXES,
}: {
	featureId: string;
	prefixes?: BenchFanoutShapePrefixes;
}) => `${prefixes.catalogEntitlement}${featureId}`;

export const resolveFanoutShapeFeatures = ({
	features,
	prefixes = BENCH_FANOUT_PREFIXES,
}: {
	features: Feature[];
	prefixes?: BenchFanoutShapePrefixes;
}): FanoutShapeFeatureSpec[] =>
	FANOUT_SHAPE_FEATURES.map((spec) => {
		const feature = features.find(
			(candidate) => candidate.id === spec.featureId,
		);
		if (!feature) {
			throw new Error(
				`bench: missing feature ${spec.featureId} on the bench org`,
			);
		}
		return {
			...spec,
			internalFeatureId: feature.internal_id,
			entitlementId: catalogEntitlementIdFor({
				featureId: spec.featureId,
				prefixes,
			}),
			startingBalance: FANOUT_SHAPE_FROM_INCLUDED - spec.consumed,
			expectedBalance: FANOUT_SHAPE_TO_INCLUDED - spec.consumed,
		};
	});

export const ensureBenchFanoutShapeProduct = async ({
	db,
	orgId,
	env,
	features,
	prefixes = BENCH_FANOUT_PREFIXES,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	features: FanoutShapeFeatureSpec[];
	prefixes?: BenchFanoutShapePrefixes;
}): Promise<{ internalProductId: string }> => {
	const [existingProduct] = await db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.id, prefixes.productId),
			),
		)
		.limit(1);

	const internalProductId = existingProduct?.internal_id ?? generateId("prod");
	if (!existingProduct) {
		await db.insert(products).values({
			internal_id: internalProductId,
			id: prefixes.productId,
			org_id: orgId,
			env,
			name: "Bench Fanout Shape",
			created_at: Date.now(),
			version: 1,
		});
	}

	for (const feature of features) {
		const [existingEntitlement] = await db
			.select()
			.from(entitlements)
			.where(eq(entitlements.id, feature.entitlementId))
			.limit(1);
		if (existingEntitlement) continue;

		await db.insert(entitlements).values({
			id: feature.entitlementId,
			created_at: Date.now(),
			org_id: orgId,
			internal_product_id: internalProductId,
			internal_feature_id: feature.internalFeatureId,
			feature_id: feature.featureId,
			allowance_type: AllowanceType.Fixed,
			allowance: FANOUT_SHAPE_FROM_INCLUDED,
			interval: EntInterval.Month,
			interval_count: 1,
		});
	}

	return { internalProductId };
};

/** Own prefixes: a replace mutates every measured row, so this dataset
 * cannot share customer_entitlements with the other plan-item benches. */
export const seedBenchFanoutShape = async ({
	db,
	count,
	planInternalProductId,
	features,
	startsAt,
	orgId,
	env,
	prefixes = BENCH_FANOUT_PREFIXES,
}: {
	db: DrizzleCli;
	count: number;
	planInternalProductId: string;
	features: FanoutShapeFeatureSpec[];
	startsAt: number;
	orgId: string;
	env: string;
	prefixes?: BenchFanoutShapePrefixes;
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
			'bench fanout shape',
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
			${prefixes.productId},
			${prefixes.customerId} || i,
			'{}'::jsonb[]
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	for (const feature of features) {
		const entitlementRowPrefix = `${prefixes.entitlement}${feature.featureId}_`;
		await db.execute(sql`
			INSERT INTO customer_entitlements (
				id, customer_product_id, entitlement_id, internal_customer_id,
				internal_feature_id, feature_id, customer_id, unlimited, balance,
				created_at, reset_cycle_anchor, next_reset_at, usage_allowed,
				separate_interval, adjustment, additional_balance, cache_version
			)
			SELECT
				${entitlementRowPrefix} || i,
				${prefixes.customerProduct} || i,
				${feature.entitlementId},
				${prefixes.internalCustomer} || i,
				${feature.internalFeatureId},
				${feature.featureId},
				${prefixes.customerId} || i,
				false,
				${feature.startingBalance},
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
	}
};
