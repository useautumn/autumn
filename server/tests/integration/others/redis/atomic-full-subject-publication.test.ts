import { afterAll, beforeEach, expect, test } from "bun:test";
import {
	AppEnv,
	type FullCustomerEntitlement,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import { createRedisClient } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { publishCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.js";
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

beforeEach(async () => {
	await redis
		.multi()
		.del(subjectKey, epochKey, balanceKey)
		.set(subjectKey, JSON.stringify(sourceSubject))
		.set(epochKey, "2")
		.hset(
			balanceKey,
			"entitlement_a",
			JSON.stringify({ balance: 95 }),
			"unrelated_entitlement",
			liveUnrelatedBalance,
		)
		.exec();
});

test("atomically publishes B while preserving unrelated live balances", async () => {
	const result = await publishCachedFullSubject({
		ctx,
		normalized: targetNormalized,
		outgoingCustomerEntitlements: [sourceBalance],
	});

	const [rawSubject, epoch, balances] = await Promise.all([
		redis.get(subjectKey),
		redis.get(epochKey),
		redis.hgetall(balanceKey),
	]);

	expect(result).toBe("OK");
	expect(epoch).toBe("3");
	expect(JSON.parse(rawSubject ?? "{}")).toMatchObject({
		subjectViewEpoch: 3,
		customerEntitlementIdsByFeatureId: {
			messages: ["entitlement_b", "unrelated_entitlement"],
		},
	});
	expect(balances.entitlement_a).toBeUndefined();
	expect(JSON.parse(balances.entitlement_b).balance).toBe(195);
	expect(balances.unrelated_entitlement).toBe(liveUnrelatedBalance);
});

afterAll(async () => {
	await redis.del(subjectKey, epochKey, balanceKey);
	redis.disconnect();
});
