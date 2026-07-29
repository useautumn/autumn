import {
	AllowanceType,
	ApiVersionClass,
	AppEnv,
	AuthType,
	BillingInterval,
	EntInterval,
	entitlements,
	type Feature,
	FixedPriceConfigSchema,
	LATEST_VERSION,
	type Organization,
	prices,
	products,
} from "@autumn/shared";
import { getFeatures, TestFeature } from "@tests/setup/v2Features.js";
import { and, eq, sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";

export const BENCH_ORG_SLUG = "batch-bench";
export const BENCH_ENV = AppEnv.Sandbox;

export const BENCH_FREE_PRODUCT_ID = "bench-free";
export const BENCH_FREE_BARE_PRODUCT_ID = "bench-free-bare";
export const BENCH_PAID_PRODUCT_ID = "bench-paid";

export const BENCH_CUSTOMER_ID_PREFIX = "bench-c-";
export const BENCH_INTERNAL_CUSTOMER_PREFIX = "cus_bench_";
export const BENCH_CUSTOMER_PRODUCT_PREFIX = "cp_bench_";
export const BENCH_CUSTOMER_ENTITLEMENT_PREFIX = "ce_bench_";
export const BENCH_CUSTOMER_PRICE_PREFIX = "cpr_bench_";
export const BENCH_SUBSCRIPTION_PREFIX = "sub_bench_";
export const BENCH_STRIPE_SUBSCRIPTION_PREFIX = "sub_mock_bench_";

/** Refuse to run against anything that smells like prod. */
export const assertBenchDatabaseSafe = () => {
	const url = process.env.DATABASE_URL ?? "";
	if (url.includes("us-east-2")) {
		throw new Error("bench: refusing to run against a prod DATABASE_URL");
	}
};

export type BenchProducts = {
	/** Free plan WITH a monthly Messages entitlement (sibling-anchor rung). */
	free: { internalId: string; entitlementId: string };
	/** Free plan with no entitlements (starts_at / cp-anchor rungs). */
	freeBare: { internalId: string };
	/** $20/mo base-price plan, no entitlements (sub-anchor / paid-now rungs). */
	paid: { internalId: string; priceId: string };
	messagesInternalFeatureId: string;
};

export type BenchContext = {
	ctx: AutumnContext;
	org: Organization;
	benchProducts: BenchProducts;
};

/** The dashboard's org list is membership-driven; make the bench org
 * browsable by adding every dev-DB user as an owner. */
const ensureAllUsersAreMembers = async ({
	db,
	org,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	org: Organization;
}) => {
	await db.execute(sql`
		INSERT INTO member (id, organization_id, user_id, role, created_at)
		SELECT 'mem_bench_' || u.id, ${org.id}, u.id, 'owner', NOW()
		FROM "user" AS u
		WHERE NOT EXISTS (
			SELECT 1 FROM member AS m
			WHERE m.organization_id = ${org.id} AND m.user_id = u.id
		)
	`);
};

const ensureFeatures = async ({
	db,
	org,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	org: Organization;
}): Promise<Feature[]> => {
	const existing = await FeatureService.list({
		db,
		orgId: org.id,
		env: BENCH_ENV,
	});
	if (existing.length > 0) return existing;

	await FeatureService.insert({
		db,
		data: Object.values(getFeatures({ orgId: org.id })),
		logger,
	});
	return FeatureService.list({ db, orgId: org.id, env: BENCH_ENV });
};

const ensureProduct = async ({
	db,
	org,
	productId,
	name,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	org: Organization;
	productId: string;
	name: string;
}) => {
	const [existing] = await db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, org.id),
				eq(products.env, BENCH_ENV),
				eq(products.id, productId),
			),
		)
		.limit(1);
	if (existing) return existing.internal_id;

	const internalId = generateId("prod");
	await db.insert(products).values({
		internal_id: internalId,
		id: productId,
		org_id: org.id,
		env: BENCH_ENV,
		name,
		created_at: Date.now(),
		version: 1,
	});
	return internalId;
};

const ensureBenchProducts = async ({
	db,
	org,
	features,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	org: Organization;
	features: Feature[];
}): Promise<BenchProducts> => {
	const messagesFeature = features.find(
		(feature) => feature.id === TestFeature.Messages,
	);
	if (!messagesFeature)
		throw new Error("bench: messages feature missing after seed");

	const freeInternalId = await ensureProduct({
		db,
		org,
		productId: BENCH_FREE_PRODUCT_ID,
		name: "Bench Free",
	});
	const freeBareInternalId = await ensureProduct({
		db,
		org,
		productId: BENCH_FREE_BARE_PRODUCT_ID,
		name: "Bench Free Bare",
	});
	const paidInternalId = await ensureProduct({
		db,
		org,
		productId: BENCH_PAID_PRODUCT_ID,
		name: "Bench Paid",
	});

	const [existingEntitlement] = await db
		.select()
		.from(entitlements)
		.where(eq(entitlements.internal_product_id, freeInternalId))
		.limit(1);
	let entitlementId = existingEntitlement?.id;
	if (!entitlementId) {
		entitlementId = generateId("ent");
		await db.insert(entitlements).values({
			id: entitlementId,
			created_at: Date.now(),
			org_id: org.id,
			internal_product_id: freeInternalId,
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			allowance_type: AllowanceType.Fixed,
			allowance: 100,
			interval: EntInterval.Month,
			interval_count: 1,
		});
	}

	const [existingPrice] = await db
		.select()
		.from(prices)
		.where(eq(prices.internal_product_id, paidInternalId))
		.limit(1);
	let priceId = existingPrice?.id;
	if (!priceId) {
		priceId = generateId("pr");
		await db.insert(prices).values({
			id: priceId,
			org_id: org.id,
			internal_product_id: paidInternalId,
			created_at: Date.now(),
			config: FixedPriceConfigSchema.parse({
				type: "fixed",
				amount: 20,
				interval: BillingInterval.Month,
				interval_count: 1,
			}),
		});
	}

	return {
		free: { internalId: freeInternalId, entitlementId },
		freeBare: { internalId: freeBareInternalId },
		paid: { internalId: paidInternalId, priceId },
		messagesInternalFeatureId: messagesFeature.internal_id,
	};
};

/** Resolve-or-create the dedicated bench org (never the shared test org),
 * its features, and the three bench plans covering every anchor-ladder rung. */
export const getBenchContext = async (): Promise<BenchContext> => {
	assertBenchDatabaseSafe();
	const { db } = initDrizzle();

	let org = await OrgService.getBySlug({ db, slug: BENCH_ORG_SLUG });
	if (!org) {
		org = await OrgService.create({
			db,
			id: generateId("org"),
			slug: BENCH_ORG_SLUG,
			name: "Batch Migrations Bench",
			createdBy: "batch-bench-seed",
		});
	}

	await ensureAllUsersAreMembers({ db, org });
	const features = await ensureFeatures({ db, org });
	const benchProducts = await ensureBenchProducts({ db, org, features });

	const ctx: AutumnContext = {
		org,
		env: BENCH_ENV,
		features,
		db,
		dbGeneral: db,
		logger,
		redisV2: resolveRedisV2(),
		id: generateId("bench"),
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		timestamp: Date.now(),
		scopes: [],
		skipCache: false,
		expand: [],
		extraLogs: {},
	};

	return { ctx, org, benchProducts };
};
