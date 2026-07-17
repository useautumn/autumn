import { afterEach, beforeAll, expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

const customerId = "pooled-multi-feature-cutover-test";
const customerEntityId = "pooled-customer-entity";
const entityId = "pooled-entity";
const expectedSubjectViewEpoch = 11;
const epochKey = buildFullSubjectViewEpochKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
});
const messagesBalanceKey = buildSharedFullSubjectBalanceKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
	featureId: TestFeature.Messages,
});
const creditsBalanceKey = buildSharedFullSubjectBalanceKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
	featureId: TestFeature.Credits,
});

const buildBalance = ({
	id,
	featureId,
	balance,
	adjustment,
	isEntityLevel = false,
}: {
	id: string;
	featureId: string;
	balance: number;
	adjustment: number;
	isEntityLevel?: boolean;
}) => ({
	id,
	feature_id: featureId,
	balance,
	adjustment,
	additional_balance: 0,
	cache_version: 7,
	isEntityLevel,
	internal_entity_id: isEntityLevel ? entityId : null,
	rollovers: [],
	replaceables: [],
});

const messagesBalance = buildBalance({
	id: customerEntityId,
	featureId: TestFeature.Messages,
	balance: 200,
	adjustment: 500,
	isEntityLevel: true,
});
const creditsBalance = buildBalance({
	id: "pooled-credits",
	featureId: TestFeature.Credits,
	balance: 500,
	adjustment: 500,
});
const aggregatedMessagesBalance = {
	balance: 200,
	adjustment: 500,
	rollover_balance: 0,
	rollover_usage: 0,
	entities: {
		[entityId]: {
			balance: 200,
			adjustment: 500,
			rollover_balance: 0,
			rollover_usage: 0,
		},
	},
};

const seedFeatureHashes = async (): Promise<void> => {
	await ctx.redisV2
		.pipeline()
		.set(epochKey, String(expectedSubjectViewEpoch))
		.hset(
			messagesBalanceKey,
			"_subject_view_epoch",
			String(expectedSubjectViewEpoch),
			customerEntityId,
			JSON.stringify(messagesBalance),
			"_aggregated",
			JSON.stringify(aggregatedMessagesBalance),
		)
		.hset(
			creditsBalanceKey,
			"_subject_view_epoch",
			String(expectedSubjectViewEpoch),
			creditsBalance.id,
			JSON.stringify(creditsBalance),
		)
		.exec();
};

const executeCutover = async ({
	expectedEpoch = expectedSubjectViewEpoch,
	batches,
}: {
	expectedEpoch?: number;
	batches: Array<{ updates: Array<Record<string, unknown>> }>;
}) => {
	const resultJson = await ctx.redisV2.updateSubjectBalanceBatches(
		3,
		epochKey,
		messagesBalanceKey,
		creditsBalanceKey,
		JSON.stringify({
			expected_subject_view_epoch: expectedEpoch,
			ttl_seconds: 120,
			batches,
		}),
	);
	return JSON.parse(resultJson) as {
		applied?: Record<string, boolean>;
		cache_miss?: boolean;
		conflict?: boolean;
		epoch_mismatch?: boolean;
		invalid?: string[];
		mismatched?: string[];
		mismatched_epoch_fields?: number[];
		missing?: string[];
		missing_epoch_key?: boolean;
		missing_epoch_fields?: number[];
		missing_hashes?: number[];
	};
};

const readBalance = async ({ key, id }: { key: string; id: string }) => {
	const raw = await ctx.redisV2.hget(key, id);
	return raw ? (JSON.parse(raw) as ReturnType<typeof buildBalance>) : null;
};

beforeAll(async () => {
	await waitForRedisReady(ctx.redisV2, "pooled-multi-feature-cutover", 5000);
});

afterEach(async () => {
	await ctx.redisV2.del(epochKey, messagesBalanceKey, creditsBalanceKey);
});

test("updateSubjectBalanceBatches atomically updates two feature hashes", async () => {
	await seedFeatureHashes();

	const result = await executeCutover({
		batches: [
			{
				updates: [
					{
						cus_ent_id: customerEntityId,
						balance_delta: -200,
						adjustment_delta: -500,
						expected_balance: 200,
						expected_adjustment: 500,
					},
				],
			},
			{
				updates: [
					{
						cus_ent_id: creditsBalance.id,
						balance_delta: -300,
						expected_balance: 500,
					},
				],
			},
		],
	});
	const [updatedMessages, updatedCredits, aggregatedRaw] = await Promise.all([
		readBalance({ key: messagesBalanceKey, id: customerEntityId }),
		readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
		ctx.redisV2.hget(messagesBalanceKey, "_aggregated"),
	]);

	expect(result.conflict).not.toBe(true);
	expect(result.applied).toEqual({
		[customerEntityId]: true,
		[creditsBalance.id]: true,
	});
	expect(updatedMessages).toMatchObject({
		balance: 0,
		adjustment: 0,
		cache_version: 7,
	});
	expect(updatedCredits).toMatchObject({
		balance: 200,
		adjustment: 500,
		cache_version: 7,
	});
	expect(aggregatedRaw ? JSON.parse(aggregatedRaw) : null).toMatchObject({
		balance: 0,
		adjustment: 0,
		entities: { [entityId]: { balance: 0, adjustment: 0 } },
	});
	expect(await ctx.redisV2.ttl(messagesBalanceKey)).toBeGreaterThan(0);
	expect(await ctx.redisV2.ttl(creditsBalanceKey)).toBeGreaterThan(0);
});

test("a conflict in the second feature leaves the first feature unchanged", async () => {
	await seedFeatureHashes();

	const result = await executeCutover({
		batches: [
			{
				updates: [
					{
						cus_ent_id: customerEntityId,
						balance_delta: -200,
						expected_balance: 200,
					},
				],
			},
			{
				updates: [
					{
						cus_ent_id: creditsBalance.id,
						balance_delta: -300,
						expected_balance: 501,
					},
				],
			},
		],
	});

	expect(result).toMatchObject({
		conflict: true,
		mismatched: [creditsBalance.id],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("a subject-view epoch mismatch leaves every feature unchanged", async () => {
	await seedFeatureHashes();
	await ctx.redisV2.set(epochKey, String(expectedSubjectViewEpoch + 1));

	const result = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: creditsBalance.id, balance_delta: -300 }] },
		],
	});

	expect(result).toMatchObject({
		conflict: true,
		epoch_mismatch: true,
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("a stale feature-hash epoch leaves every feature unchanged", async () => {
	await seedFeatureHashes();
	await ctx.redisV2.hset(
		creditsBalanceKey,
		"_subject_view_epoch",
		String(expectedSubjectViewEpoch - 1),
	);

	const result = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: creditsBalance.id, balance_delta: -300 }] },
		],
	});

	expect(result).toMatchObject({
		conflict: true,
		epoch_mismatch: true,
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("a missing feature hash or hash epoch rejects the whole cutover", async () => {
	await seedFeatureHashes();
	await ctx.redisV2.del(creditsBalanceKey);

	const missingHashResult = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: creditsBalance.id, balance_delta: -300 }] },
		],
	});
	await seedFeatureHashes();
	await ctx.redisV2.hdel(creditsBalanceKey, "_subject_view_epoch");
	const missingEpochResult = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: creditsBalance.id, balance_delta: -300 }] },
		],
	});

	expect(missingHashResult).toMatchObject({
		cache_miss: true,
		conflict: true,
		missing_hashes: [2],
	});
	expect(missingEpochResult).toMatchObject({
		cache_miss: true,
		conflict: true,
		missing_epoch_fields: [2],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("missing fields and duplicate or ambiguous updates reject the whole cutover", async () => {
	await seedFeatureHashes();

	const missingResult = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: "missing-credits", balance_delta: -300 }] },
		],
	});
	const invalidResult = await executeCutover({
		batches: [
			{
				updates: [
					{ cus_ent_id: customerEntityId, balance_delta: -200 },
					{ cus_ent_id: customerEntityId, adjustment_delta: -500 },
				],
			},
			{
				updates: [
					{
						cus_ent_id: creditsBalance.id,
						balance: 200,
						balance_delta: -300,
					},
				],
			},
		],
	});

	expect(missingResult).toMatchObject({
		conflict: true,
		missing: ["missing-credits"],
	});
	expect(invalidResult).toMatchObject({
		conflict: true,
		invalid: [customerEntityId, creditsBalance.id],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("a missing global epoch or invalid batch configuration writes nothing", async () => {
	await seedFeatureHashes();
	await ctx.redisV2.del(epochKey);

	const missingEpochResult = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: creditsBalance.id, balance_delta: -300 }] },
		],
	});
	await ctx.redisV2.set(epochKey, String(expectedSubjectViewEpoch));
	const invalidConfigurationJson =
		await ctx.redisV2.updateSubjectBalanceBatches(
			3,
			epochKey,
			messagesBalanceKey,
			creditsBalanceKey,
			JSON.stringify({
				expected_subject_view_epoch: expectedSubjectViewEpoch,
				batches: [
					{
						updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }],
					},
				],
			}),
		);
	const invalidConfigurationResult = JSON.parse(invalidConfigurationJson) as {
		conflict?: boolean;
		invalid?: string[];
	};

	expect(missingEpochResult).toMatchObject({
		cache_miss: true,
		conflict: true,
		missing_epoch_key: true,
	});
	expect(invalidConfigurationResult).toMatchObject({
		conflict: true,
		invalid: ["batch_configuration"],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("missing IDs and cross-feature duplicates return conflicts without writing", async () => {
	await seedFeatureHashes();

	const missingIdResult = await executeCutover({
		batches: [
			{ updates: [{ balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: creditsBalance.id, balance_delta: -300 }] },
		],
	});
	const duplicateResult = await executeCutover({
		batches: [
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -200 }] },
			{ updates: [{ cus_ent_id: customerEntityId, balance_delta: -300 }] },
		],
	});

	expect(missingIdResult).toMatchObject({
		conflict: true,
		invalid: ["missing_cus_ent_id"],
	});
	expect(duplicateResult).toMatchObject({
		conflict: true,
		invalid: [customerEntityId],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("adjustment ambiguity and expected adjustment or reset mismatches write nothing", async () => {
	await seedFeatureHashes();

	const ambiguousResult = await executeCutover({
		batches: [
			{
				updates: [
					{
						cus_ent_id: customerEntityId,
						adjustment: 100,
						adjustment_delta: -100,
					},
				],
			},
			{ updates: [] },
		],
	});
	const expectedValueResult = await executeCutover({
		batches: [
			{
				updates: [
					{
						cus_ent_id: customerEntityId,
						balance_delta: -200,
						expected_adjustment: 499,
					},
				],
			},
			{
				updates: [
					{
						cus_ent_id: creditsBalance.id,
						balance_delta: -300,
						expected_next_reset_at: 1,
					},
				],
			},
		],
	});

	expect(ambiguousResult).toMatchObject({
		conflict: true,
		invalid: [customerEntityId],
	});
	expect(expectedValueResult).toMatchObject({
		conflict: true,
		mismatched: [customerEntityId, creditsBalance.id],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
	expect(
		await readBalance({ key: creditsBalanceKey, id: creditsBalance.id }),
	).toEqual(creditsBalance);
});

test("expected-balance guards use the cache rounding tolerance", async () => {
	await seedFeatureHashes();

	const withinToleranceResult = await executeCutover({
		batches: [
			{
				updates: [
					{
						cus_ent_id: customerEntityId,
						balance_delta: -1,
						expected_balance: 200.00000000004,
					},
				],
			},
			{ updates: [] },
		],
	});
	const updatedWithinTolerance = await readBalance({
		key: messagesBalanceKey,
		id: customerEntityId,
	});

	await seedFeatureHashes();
	const outsideToleranceResult = await executeCutover({
		batches: [
			{
				updates: [
					{
						cus_ent_id: customerEntityId,
						balance_delta: -1,
						expected_balance: 200.00000000006,
					},
				],
			},
			{ updates: [] },
		],
	});

	expect(withinToleranceResult.conflict).not.toBe(true);
	expect(updatedWithinTolerance).toMatchObject({
		balance: 199,
		cache_version: 7,
	});
	expect(outsideToleranceResult).toMatchObject({
		conflict: true,
		mismatched: [customerEntityId],
	});
	expect(
		await readBalance({ key: messagesBalanceKey, id: customerEntityId }),
	).toEqual(messagesBalance);
});
