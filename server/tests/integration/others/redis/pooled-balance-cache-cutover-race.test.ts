import { afterEach, beforeAll, expect, test } from "bun:test";
import {
	AllowanceType,
	customerEntitlements,
	EntInterval,
	entitlements,
	FeatureType,
	type FullSubject,
	findFeatureById,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { inArray } from "drizzle-orm";
import { redis, waitForRedisReady } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyPooledBalanceCacheCutover } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCacheEffects.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import {
	type CachedFullSubject,
	FULL_SUBJECT_CACHE_SCHEMA_VERSION,
} from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

const customerId = "pooled-cache-cutover-race";
const balanceKey = buildSharedFullSubjectBalanceKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
	featureId: TestFeature.Messages,
});
const epochKey = buildFullSubjectViewEpochKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
});
const subjectKey = buildFullSubjectKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
});
const fullCustomerKey = buildFullCustomerCacheKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
});
const insertedCustomerEntitlementIds = new Set<string>();
const insertedEntitlementIds = new Set<string>();

const getMessagesFeature = () =>
	findFeatureById({
		features: ctx.features,
		featureId: TestFeature.Messages,
		errorOnNotFound: true,
	});

const buildCustomerEntitlement = ({
	id,
	interval,
	balance,
	adjustment,
}: {
	id: string;
	interval: EntInterval;
	balance: number;
	adjustment: number;
}) => ({
	id,
	internal_customer_id: "internal-pooled-cache-cutover-race",
	internal_entity_id: null,
	internal_feature_id: getMessagesFeature().internal_id,
	customer_id: customerId,
	feature_id: TestFeature.Messages,
	customer_product_id: null,
	entitlement_id: `entitlement-${id}`,
	created_at: 1,
	unlimited: false,
	balance,
	additional_balance: 0,
	usage_allowed: false,
	separate_interval: false,
	reset_cycle_anchor: 1_800_000_000_000,
	next_reset_at: 1_900_000_000_000,
	adjustment,
	expires_at: null,
	cache_version: 7,
	entities: null,
	external_id: null,
	entitlement: {
		id: `entitlement-${id}`,
		internal_feature_id: getMessagesFeature().internal_id,
		internal_product_id: null,
		internal_reward_id: null,
		is_custom: true,
		allowance_type: AllowanceType.Fixed,
		allowance: 0,
		interval,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		pooled: true,
		feature_id: TestFeature.Messages,
		usage_limit: null,
		expiry_duration: null,
		expiry_length: null,
		rollover: null,
		feature: {
			id: TestFeature.Messages,
			internal_id: getMessagesFeature().internal_id,
			type: FeatureType.Metered,
		},
	},
	replaceables: [],
	rollovers: [],
});

type BuiltCustomerEntitlement = ReturnType<typeof buildCustomerEntitlement>;

const persistCustomerEntitlementFixtures = async ({
	balances,
}: {
	balances: BuiltCustomerEntitlement[];
}) => {
	const customerEntitlementIds = balances.map((balance) => balance.id);
	const entitlementIds = balances.map((balance) => balance.entitlement_id);
	for (const customerEntitlementId of customerEntitlementIds) {
		insertedCustomerEntitlementIds.add(customerEntitlementId);
	}
	for (const entitlementId of entitlementIds) {
		insertedEntitlementIds.add(entitlementId);
	}

	await ctx.db
		.delete(customerEntitlements)
		.where(inArray(customerEntitlements.id, customerEntitlementIds));
	await ctx.db
		.delete(entitlements)
		.where(inArray(entitlements.id, entitlementIds));

	await ctx.db.insert(entitlements).values(
		balances.map((balance) => ({
			id: balance.entitlement.id,
			created_at: balance.created_at,
			internal_feature_id: balance.internal_feature_id,
			is_custom: balance.entitlement.is_custom,
			allowance_type: balance.entitlement.allowance_type,
			allowance: balance.entitlement.allowance,
			interval: balance.entitlement.interval,
			interval_count: balance.entitlement.interval_count,
			carry_from_previous: balance.entitlement.carry_from_previous,
			entity_feature_id: balance.entitlement.entity_feature_id,
			pooled: balance.entitlement.pooled,
			org_id: ctx.org.id,
			feature_id: balance.feature_id,
			usage_limit: balance.entitlement.usage_limit,
			expiry_duration: balance.entitlement.expiry_duration,
			expiry_length: balance.entitlement.expiry_length,
			rollover: balance.entitlement.rollover,
		})),
	);
	await ctx.db.insert(customerEntitlements).values(
		balances.map((balance) => ({
			id: balance.id,
			customer_product_id: balance.customer_product_id,
			entitlement_id: balance.entitlement_id,
			internal_customer_id: balance.internal_customer_id,
			internal_entity_id: balance.internal_entity_id,
			internal_feature_id: balance.internal_feature_id,
			unlimited: balance.unlimited,
			balance: balance.balance,
			created_at: balance.created_at,
			reset_cycle_anchor: balance.reset_cycle_anchor,
			next_reset_at: balance.next_reset_at,
			usage_allowed: balance.usage_allowed,
			separate_interval: balance.separate_interval,
			adjustment: balance.adjustment,
			additional_balance: balance.additional_balance,
			entities: balance.entities,
			expires_at: balance.expires_at,
			cache_version: balance.cache_version,
			customer_id: balance.customer_id,
			feature_id: balance.feature_id,
			external_id: balance.external_id,
		})),
	);
};

const buildSubjectManifest = ({
	customerEntitlementIds,
	subjectViewEpoch = 0,
}: {
	customerEntitlementIds: string[];
	subjectViewEpoch?: number;
}): CachedFullSubject => ({
	subjectType: "customer",
	customerId,
	internalCustomerId: "internal-pooled-cache-cutover-race",
	customer: {
		id: customerId,
		internal_id: "internal-pooled-cache-cutover-race",
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: 1,
		name: "Pooled cache cutover race",
		email: null,
		fingerprint: null,
		processor: null,
		processors: {},
		metadata: {},
		send_email_receipts: false,
		auto_topups: null,
		spend_limits: null,
		usage_limits: null,
		usage_alerts: null,
		overage_allowed: null,
		config: {},
	},
	customer_products: [],
	customer_prices: [],
	customer_licenses: [],
	flags: {},
	products: [],
	entitlements: [],
	prices: [],
	free_trials: [],
	subscriptions: [],
	invoices: [],
	migration_item_runs: [],
	_schemaVersion: FULL_SUBJECT_CACHE_SCHEMA_VERSION,
	_cachedAt: Date.now(),
	meteredFeatures: [TestFeature.Messages],
	customerEntitlementIdsByFeatureId: {
		[TestFeature.Messages]: customerEntitlementIds,
	},
	usageWindowFeatureIds: [],
	subjectViewEpoch,
});

beforeAll(async () => {
	await waitForRedisReady(ctx.redisV2, "pooled-cache-cutover-race", 5000);
});

afterEach(async () => {
	await ctx.redisV2.del(balanceKey, epochKey, subjectKey);
	await redis.del(fullCustomerKey);
	if (insertedCustomerEntitlementIds.size > 0) {
		await ctx.db
			.delete(customerEntitlements)
			.where(
				inArray(customerEntitlements.id, [...insertedCustomerEntitlementIds]),
			);
	}
	if (insertedEntitlementIds.size > 0) {
		await ctx.db
			.delete(entitlements)
			.where(inArray(entitlements.id, [...insertedEntitlementIds]));
	}
	insertedCustomerEntitlementIds.clear();
	insertedEntitlementIds.clear();
});

test("pooled lifecycle fallback fails closed when the subject snapshot GET fails", async () => {
	const pooledId = "pooled-capture-failure";
	const pooled = buildCustomerEntitlement({
		id: pooledId,
		interval: EntInterval.Month,
		balance: 500,
		adjustment: 500,
	});
	const fullSubject = {
		subjectType: "customer",
		customerId,
		internalCustomerId: "internal-pooled-cache-cutover-race",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: [pooled],
		invoices: [],
	} as unknown as FullSubject;
	await persistCustomerEntitlementFixtures({ balances: [pooled] });
	await ctx.redisV2.set(
		subjectKey,
		JSON.stringify(
			buildSubjectManifest({ customerEntitlementIds: [pooledId] }),
		),
	);
	let captureGetAttempts = 0;
	const redisV2 = new Proxy(ctx.redisV2, {
		get(target, property) {
			if (property === "get") {
				return async (key: string) => {
					if (key === subjectKey) {
						captureGetAttempts += 1;
						throw new Error("synthetic lifecycle capture failure");
					}
					return target.get(key);
				};
			}

			const value = Reflect.get(target, property, target) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as AutumnContext["redisV2"];

	await expect(
		applyPooledBalanceCacheCutover({
			ctx: { ...ctx, redisV2 } as AutumnContext,
			customerId,
			fullSubject,
			featureIds: [TestFeature.Messages],
			rawEffects: [
				{
					featureId: TestFeature.Messages,
					customerEntitlementId: pooledId,
					balanceDelta: -100,
					adjustmentDelta: -100,
				},
			],
			expectedSubjectViewEpoch: 0,
		}),
	).rejects.toThrow("source=captureSharedBalanceFields:get");
	expect(captureGetAttempts).toBe(1);
});

test("pooled cache cutover retries against live balances when track wins the race", async () => {
	const removedId = "pooled-race-removed";
	const survivingId = "pooled-race-surviving";
	const removed = buildCustomerEntitlement({
		id: removedId,
		interval: EntInterval.Day,
		balance: 0,
		adjustment: 0,
	});
	const surviving = buildCustomerEntitlement({
		id: survivingId,
		interval: EntInterval.Month,
		balance: 200,
		adjustment: 500,
	});
	const fullSubject = {
		subjectType: "customer",
		customerId,
		internalCustomerId: "internal-pooled-cache-cutover-race",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: [removed, surviving],
		invoices: [],
	} as unknown as FullSubject;
	await persistCustomerEntitlementFixtures({
		balances: [removed, surviving],
	});
	const subjectManifest = buildSubjectManifest({
		customerEntitlementIds: [removedId, survivingId],
	});

	await ctx.redisV2.hset(
		balanceKey,
		removedId,
		JSON.stringify({ ...removed, balance: 200, adjustment: 500 }),
		survivingId,
		JSON.stringify({ ...surviving, balance: 500, adjustment: 500 }),
		"_subject_view_epoch",
		"0",
	);
	await ctx.redisV2.set(epochKey, "0");
	await ctx.redisV2.set(subjectKey, JSON.stringify(subjectManifest));
	await redis.set(fullCustomerKey, JSON.stringify({ stale: true }));

	let updateAttempts = 0;
	const redisV2 = new Proxy(ctx.redisV2, {
		get(target, property) {
			if (property === "updateSubjectBalanceBatches") {
				return async (...args: [number, ...string[]]) => {
					updateAttempts += 1;
					if (updateAttempts === 1) {
						const liveValue = await target.hget(balanceKey, removedId);
						if (!liveValue) throw new Error("Expected cached removed balance");
						const trackedBalance = JSON.parse(liveValue) as {
							balance: number;
						};
						trackedBalance.balance -= 100;
						await target.hset(
							balanceKey,
							removedId,
							JSON.stringify(trackedBalance),
						);
					}
					return target.updateSubjectBalanceBatches(...args);
				};
			}

			const value = Reflect.get(target, property, target) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as AutumnContext["redisV2"];
	const raceContext = { ...ctx, redisV2 } as AutumnContext;

	await applyPooledBalanceCacheCutover({
		ctx: raceContext,
		customerId,
		fullSubject,
		featureIds: [TestFeature.Messages],
		rawEffects: [
			{
				featureId: TestFeature.Messages,
				customerEntitlementId: removedId,
				balanceDelta: -500,
				adjustmentDelta: -500,
			},
		],
		expectedSubjectViewEpoch: 0,
	});

	const values = await ctx.redisV2.hmget(balanceKey, removedId, survivingId);
	const [removedBalance, survivingBalance] = values.map((value) =>
		value
			? (JSON.parse(value) as {
					balance: number;
					adjustment: number;
					cache_version: number;
				})
			: null,
	);

	expect(updateAttempts).toBe(2);
	expect(removedBalance).toMatchObject({
		balance: 0,
		adjustment: 0,
		cache_version: 7,
	});
	expect(survivingBalance).toMatchObject({
		balance: 100,
		adjustment: 500,
		cache_version: 7,
	});
	const persistedBalances = await ctx.db
		.select({
			id: customerEntitlements.id,
			balance: customerEntitlements.balance,
			adjustment: customerEntitlements.adjustment,
		})
		.from(customerEntitlements)
		.where(inArray(customerEntitlements.id, [removedId, survivingId]));
	expect(
		Object.fromEntries(
			persistedBalances.map((balance) => [
				balance.id,
				{ balance: balance.balance, adjustment: balance.adjustment },
			]),
		),
	).toEqual({
		[removedId]: { balance: 0, adjustment: 0 },
		[survivingId]: { balance: 100, adjustment: 500 },
	});
	expect(await ctx.redisV2.get(subjectKey)).toBe(
		JSON.stringify(subjectManifest),
	);
	expect(await ctx.redisV2.get(epochKey)).toBe("0");
	expect(await redis.get(fullCustomerKey)).toBeNull();
});

test("a raw lifecycle effect flushes a zero DB pool omitted from FullSubject", async () => {
	const pooledId = "pooled-raw-effect-omitted";
	const pooled = buildCustomerEntitlement({
		id: pooledId,
		interval: EntInterval.Month,
		balance: 0,
		adjustment: 0,
	});
	const fullSubject = {
		subjectType: "customer",
		customerId,
		internalCustomerId: "internal-pooled-cache-cutover-race",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: [],
		invoices: [],
	} as unknown as FullSubject;
	await persistCustomerEntitlementFixtures({ balances: [pooled] });

	await ctx.redisV2.hset(
		balanceKey,
		pooledId,
		JSON.stringify({ ...pooled, balance: 300, adjustment: 500 }),
		"_subject_view_epoch",
		"0",
	);
	await ctx.redisV2.set(epochKey, "0");

	await applyPooledBalanceCacheCutover({
		ctx,
		customerId,
		fullSubject,
		featureIds: [TestFeature.Messages],
		rawEffects: [
			{
				featureId: TestFeature.Messages,
				customerEntitlementId: pooledId,
				balanceDelta: -500,
				adjustmentDelta: -500,
			},
		],
		expectedSubjectViewEpoch: 0,
	});

	const cachedValue = await ctx.redisV2.hget(balanceKey, pooledId);
	expect(cachedValue && JSON.parse(cachedValue)).toMatchObject({
		balance: -200,
		adjustment: 0,
	});
	const persistedBalance = await ctx.db.query.customerEntitlements.findFirst({
		where: (table, { eq }) => eq(table.id, pooledId),
	});
	expect(persistedBalance).toMatchObject({
		balance: -200,
		adjustment: 0,
		cache_version: 7,
	});
});

test("an epoch change retries against the rebuilt cache without applying the lifecycle delta twice", async () => {
	const pooledId = "pooled-epoch-rebuild";
	const pooled = buildCustomerEntitlement({
		id: pooledId,
		interval: EntInterval.Month,
		balance: 0,
		adjustment: 0,
	});
	const fullSubject = {
		subjectType: "customer",
		customerId,
		internalCustomerId: "internal-pooled-cache-cutover-race",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: [pooled],
		invoices: [],
	} as unknown as FullSubject;
	await persistCustomerEntitlementFixtures({ balances: [pooled] });
	const initialSubjectManifest = buildSubjectManifest({
		customerEntitlementIds: [pooledId],
	});

	await ctx.redisV2.hset(
		balanceKey,
		pooledId,
		JSON.stringify({ ...pooled, balance: 500, adjustment: 500 }),
		"_subject_view_epoch",
		"0",
	);
	await ctx.redisV2.set(epochKey, "0");
	await ctx.redisV2.set(subjectKey, JSON.stringify(initialSubjectManifest));

	let updateAttempts = 0;
	let rebuiltSubjectManifest = initialSubjectManifest;
	const redisV2 = new Proxy(ctx.redisV2, {
		get(target, property) {
			if (property === "updateSubjectBalanceBatches") {
				return async (...args: [number, ...string[]]) => {
					updateAttempts += 1;
					if (updateAttempts === 1) {
						rebuiltSubjectManifest = buildSubjectManifest({
							customerEntitlementIds: [pooledId],
							subjectViewEpoch: 1,
						});
						await target
							.multi()
							.set(epochKey, "1")
							.set(subjectKey, JSON.stringify(rebuiltSubjectManifest))
							.hset(balanceKey, "_subject_view_epoch", "1")
							.exec();
					}
					return target.updateSubjectBalanceBatches(...args);
				};
			}

			const value = Reflect.get(target, property, target) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as AutumnContext["redisV2"];

	await applyPooledBalanceCacheCutover({
		ctx: { ...ctx, redisV2 } as AutumnContext,
		customerId,
		fullSubject,
		featureIds: [TestFeature.Messages],
		rawEffects: [
			{
				featureId: TestFeature.Messages,
				customerEntitlementId: pooledId,
				balanceDelta: -500,
				adjustmentDelta: -500,
			},
		],
		expectedSubjectViewEpoch: 0,
	});

	const value = await ctx.redisV2.hget(balanceKey, pooledId);
	expect(updateAttempts).toBe(2);
	expect(value && JSON.parse(value)).toMatchObject({
		balance: 0,
		adjustment: 0,
	});
	const persistedBalance = await ctx.db.query.customerEntitlements.findFirst({
		where: (table, { eq }) => eq(table.id, pooledId),
	});
	expect(persistedBalance).toMatchObject({
		balance: 0,
		adjustment: 0,
		cache_version: 7,
	});
	expect(await ctx.redisV2.get(subjectKey)).toBe(
		JSON.stringify(rebuiltSubjectManifest),
	);
	expect(await ctx.redisV2.get(epochKey)).toBe("1");
});
