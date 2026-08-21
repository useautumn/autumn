import { afterAll, beforeEach, expect, test } from "bun:test";
import {
	AppEnv,
	type FullCustomerEntitlement,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import { createRedisClient } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RedisDeductionErrorCode } from "@/internal/balances/utils/types/redisDeductionError.js";
import { publishCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.js";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { normalizedToCachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";

const redis = createRedisClient({
	cacheUrl: process.env.HANDOFF_TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
	region: "test:atomic-full-subject-publication",
	redisType: "subject-primary",
});
const customerId = `atomic-publication-${process.pid}`;
const keyArgs = { orgId: "org", env: AppEnv.Sandbox, customerId };
const subjectKey = buildFullSubjectKey(keyArgs);
const epochKey = buildFullSubjectViewEpochKey(keyArgs);
const balanceKey = buildSharedFullSubjectBalanceKey({
	...keyArgs,
	featureId: "messages",
});

const balance = ({ id, remaining }: { id: string; remaining: number }) =>
	({
		id,
		feature_id: "messages",
		balance: remaining,
	}) as FullCustomerEntitlement;
const normalized = ({ balances }: { balances: FullCustomerEntitlement[] }) =>
	({
		subjectType: SubjectType.Customer,
		customerId,
		internalCustomerId: "internal_customer",
		customer: {},
		customer_products: [],
		customer_entitlements: balances,
		customer_prices: [],
		customer_licenses: [],
		usage_windows: [],
		flags: {},
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
	}) as unknown as NormalizedFullSubject;
const sourceBalance = balance({ id: "entitlement_a", remaining: 95 });
const unrelatedPostgresBalance = balance({
	id: "unrelated_entitlement",
	remaining: 50,
});
const targetBalance = balance({ id: "entitlement_b", remaining: 195 });
const targetNormalized = normalized({
	balances: [targetBalance, unrelatedPostgresBalance],
});
const sourceSubject = normalizedToCachedFullSubject({
	normalized: normalized({
		balances: [sourceBalance, unrelatedPostgresBalance],
	}),
	subjectViewEpoch: 2,
});
const liveUnrelatedBalance = JSON.stringify({ balance: 45 });
const ctx = {
	org: { id: keyArgs.orgId },
	env: keyArgs.env,
	redisV2: redis,
} as AutumnContext;
const balanceTransitionPlan = {
	id: "target_product",
	outgoingCustomerEntitlements: [sourceBalance],
	transitions: [
		{
			sourceCustomerEntitlementId: "entitlement_a",
			targetCustomerEntitlementId: "entitlement_b",
			sourceBalance: 95,
			sourceAdjustment: 0,
		},
	],
};
const receiptKey = `${subjectKey}:balance_transition:${balanceTransitionPlan.id}`;

beforeEach(async () => {
	await redis
		.multi()
		.del(subjectKey, epochKey, balanceKey, receiptKey)
		.set(subjectKey, JSON.stringify(sourceSubject))
		.set(epochKey, "2")
		.hset(
			balanceKey,
			"entitlement_a",
			JSON.stringify({ balance: 90 }),
			"unrelated_entitlement",
			liveUnrelatedBalance,
		)
		.exec();
});

test("atomically publishes B while preserving unrelated live balances", async () => {
	const result = await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		balanceTransitionPlan,
	});

	const [rawSubject, epoch, balances] = await Promise.all([
		redis.get(subjectKey),
		redis.get(epochKey),
		redis.hgetall(balanceKey),
	]);

	expect(result).toMatchObject({
		status: "OK",
		balanceTransitions: [
			{
				customerEntitlementId: "entitlement_b",
				expected: { balance: 195 },
				published: { balance: 190 },
			},
		],
	});
	expect(epoch).toBe("3");
	expect(JSON.parse(rawSubject ?? "{}")).toMatchObject({
		subjectViewEpoch: 3,
		customerEntitlementIdsByFeatureId: {
			messages: ["entitlement_b", "unrelated_entitlement"],
		},
	});
	expect(balances.entitlement_a).toBeUndefined();
	expect(JSON.parse(balances.entitlement_b).balance).toBe(190);
	expect(balances.unrelated_entitlement).toBe(liveUnrelatedBalance);
});

test("replays an already-published transition without applying it twice", async () => {
	const firstResult = await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		balanceTransitionPlan,
	});
	const secondResult = await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		balanceTransitionPlan,
	});

	expect(secondResult).toEqual(firstResult);
	expect(await redis.get(epochKey)).toBe("3");
	expect(
		JSON.parse((await redis.hget(balanceKey, "entitlement_b")) ?? "{}").balance,
	).toBe(190);
});

test("leaves A untouched when B is already live", async () => {
	const liveTarget = JSON.stringify({ balance: 192 });
	await redis.hset(balanceKey, "entitlement_b", liveTarget);

	const result = await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		balanceTransitionPlan,
	});

	const [rawSubject, epoch, balances] = await Promise.all([
		redis.get(subjectKey),
		redis.get(epochKey),
		redis.hgetall(balanceKey),
	]);
	expect(result).toEqual({
		status: "UNSUPPORTED",
		reason: "target_already_cached",
	});
	expect(JSON.parse(rawSubject ?? "{}")).toMatchObject({
		customerEntitlementIdsByFeatureId: {
			messages: ["entitlement_a", "unrelated_entitlement"],
		},
	});
	expect(epoch).toBe("2");
	expect(JSON.parse(balances.entitlement_a).balance).toBe(90);
	expect(balances.entitlement_b).toBe(liveTarget);
});

test("leaves A untouched when a runtime balance has no transition", async () => {
	const result = await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		balanceTransitionPlan: {
			id: balanceTransitionPlan.id,
			outgoingCustomerEntitlements: [sourceBalance],
			transitions: [],
		},
	});

	const [rawSubject, epoch, balances] = await Promise.all([
		redis.get(subjectKey),
		redis.get(epochKey),
		redis.hgetall(balanceKey),
	]);
	expect(result).toEqual({
		status: "UNSUPPORTED",
		reason: "unmapped_runtime_balance",
	});
	expect(JSON.parse(rawSubject ?? "{}")).toMatchObject({
		customerEntitlementIdsByFeatureId: {
			messages: ["entitlement_a", "unrelated_entitlement"],
		},
	});
	expect(epoch).toBe("2");
	expect(JSON.parse(balances.entitlement_a).balance).toBe(90);
	expect(balances.entitlement_b).toBeUndefined();
});

test("rejects a stale A track before idempotency or balance mutation", async () => {
	await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		balanceTransitionPlan,
	});

	const idempotencyKey = `{${customerId}}:stale-track`;
	const { keys, balanceKeyIndexByFeatureId } =
		buildDeductFromSubjectBalancesKeys({
			...keyArgs,
			routingKey: subjectKey,
			lockReceiptKey: null,
			idempotencyKey,
			customerEntitlementDeductions: [{ feature_id: "messages" }],
			fallbackFeatureId: "messages",
		});
	const rawResult = await redis.deductFromSubjectBalances(
		keys.length,
		...keys,
		JSON.stringify({
			expected_subject_view_epoch: 2,
			customer_entitlement_deductions: [],
			balance_key_index_by_feature_id: balanceKeyIndexByFeatureId,
		}),
	);

	const [idempotencyValue, balances] = await Promise.all([
		redis.get(idempotencyKey),
		redis.hgetall(balanceKey),
	]);
	expect(JSON.parse(rawResult).error).toBe(
		RedisDeductionErrorCode.SubjectViewChanged,
	);
	expect(idempotencyValue).toBeNull();
	expect(balances.entitlement_a).toBeUndefined();
	expect(JSON.parse(balances.entitlement_b).balance).toBe(190);
});

afterAll(async () => {
	await redis.del(subjectKey, epochKey, balanceKey, receiptKey);
	redis.disconnect();
});
