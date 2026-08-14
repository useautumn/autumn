import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	AppEnv,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import type { Redis } from "ioredis";
import { createRedisClient } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { switchFullSubjectBalanceGeneration } from "@/internal/customers/cache/fullSubject/actions/switchFullSubjectBalanceGeneration.js";
import {
	buildFullSubjectBalanceGenerationKey,
	buildFullSubjectBalanceHandoffLockKey,
} from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectBalanceGenerationKey.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { normalizedToCachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";

type HandoffRedis = Redis & {
	setCachedFullSubject(numKeys: number, ...args: string[]): Promise<string>;
};

const redis = createRedisClient({
	cacheUrl: process.env.HANDOFF_TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
	region: "test:balance-handoff",
	redisType: "subject-primary",
}) as HandoffRedis;
const customerId = `balance-handoff-${process.pid}`;
const keyArgs = { orgId: "org", env: AppEnv.Sandbox, customerId };
const keys = {
	subject: buildFullSubjectKey(keyArgs),
	epoch: buildFullSubjectViewEpochKey(keyArgs),
	generation: buildFullSubjectBalanceGenerationKey(keyArgs),
	lock: buildFullSubjectBalanceHandoffLockKey(keyArgs),
	messages: buildSharedFullSubjectBalanceKey({
		...keyArgs,
		featureId: "messages",
	}),
	emails: buildSharedFullSubjectBalanceKey({ ...keyArgs, featureId: "emails" }),
	idempotency: `{${customerId}}:idempotency`,
};
const ctx = {
	org: { id: keyArgs.orgId },
	env: keyArgs.env,
	redisV2: redis,
} as unknown as AutumnContext;

const balance = ({
	id,
	featureId,
	remaining,
}: {
	id: string;
	featureId: string;
	remaining: number;
}): NormalizedFullSubject["customer_entitlements"][number] =>
	({
		...customerEntitlements.create({
			id,
			featureId,
			featureName: featureId,
			allowance: 100,
			balance: remaining,
		}),
		customer_product_id: null,
		customerPrice: null,
		customerProductOptions: null,
		customerProductQuantity: 1,
		isEntityLevel: false,
	}) as NormalizedFullSubject["customer_entitlements"][number];

const normalized = (remaining: number): NormalizedFullSubject => ({
	subjectType: SubjectType.Customer,
	customerId,
	internalCustomerId: "internal_customer",
	balanceGeneration: 4,
	customer: customers.create({}),
	customer_products: [],
	customer_entitlements: [
		balance({ id: "old_entitlement", featureId: "messages", remaining }),
	],
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
});

const source = normalized(95);
const sourceCached = normalizedToCachedFullSubject({
	normalized: source,
	subjectViewEpoch: 2,
});
sourceCached.usageWindowFeatureIds = ["messages"];
const sourceJson = JSON.stringify(sourceCached);
const lockJson = JSON.stringify({ owner: "attach", token: "lock_token" });
const fillMissingSubject = () =>
	redis.setCachedFullSubject(
		4,
		keys.subject,
		keys.epoch,
		keys.generation,
		keys.lock,
		"2",
		"60",
		"60",
		sourceJson,
		"4",
		"0",
	);

beforeEach(async () => {
	await redis
		.multi()
		.del(...Object.values(keys))
		.set(keys.subject, sourceJson)
		.set(keys.epoch, "2")
		.set(keys.generation, "4")
		.set(keys.lock, lockJson)
		.hset(
			keys.messages,
			"old_entitlement",
			JSON.stringify(source.customer_entitlements[0]),
			"other_entity_message",
			JSON.stringify({ balance: 40 }),
		)
		.hset(keys.emails, "other_entity_email", JSON.stringify({ balance: 20 }))
		.exec();
});

describe("FullSubject balance-generation handoff", () => {
	test("blocks a cold fill during attach but keeps warm cache idempotency", async () => {
		await redis.del(keys.subject);
		expect(await fillMissingSubject()).toBe("HANDOFF_IN_PROGRESS");
		expect(await redis.get(keys.subject)).toBeNull();
		await redis.set(keys.subject, sourceJson);
		expect(await fillMissingSubject()).toBe("CACHE_EXISTS");
		expect(await redis.get(keys.subject)).toBe(sourceJson);
	});

	test("retries exact A, preserves shared fields, then fences stale tracks", async () => {
		let builds = 0;
		const result = await switchFullSubjectBalanceGeneration({
			ctx,
			customerId,
			expectedGeneration: 4,
			lockToken: "lock_token",
			buildTargetFromSnapshot: async ({ snapshot }) => {
				builds++;
				const remaining = snapshot.normalized.customer_entitlements[0].balance;
				if (builds === 2) {
					await redis.hset(
						keys.messages,
						"old_entitlement",
						JSON.stringify(
							balance({
								id: "old_entitlement",
								featureId: "messages",
								remaining: 90,
							}),
						),
					);
				}
				const target = structuredClone(snapshot.normalized);
				target.customer_entitlements = [
					balance({
						id: "new_entitlement",
						featureId: "emails",
						remaining: remaining + 100,
					}),
				];
				return target;
			},
		});

		expect(result.status).toBe("switched");
		expect(builds).toBe(3);
		const [generation, epoch, lockExists, messages, emails] = await Promise.all(
			[
				redis.get(keys.generation),
				redis.get(keys.epoch),
				redis.exists(keys.lock),
				redis.hgetall(keys.messages),
				redis.hgetall(keys.emails),
			],
		);
		expect({ generation, epoch, lockExists, messages }).toEqual({
			generation: "5",
			epoch: "3",
			lockExists: 0,
			messages: { other_entity_message: JSON.stringify({ balance: 40 }) },
		});
		expect(JSON.parse(emails.new_entitlement).balance).toBe(190);
		expect(emails.other_entity_email).toBe(JSON.stringify({ balance: 20 }));

		const staleTrack = JSON.parse(
			await redis.deductFromSubjectBalances(
				5,
				keys.subject,
				keys.generation,
				"",
				keys.idempotency,
				keys.emails,
				JSON.stringify({
					org_id: keyArgs.orgId,
					env: keyArgs.env,
					customer_id: customerId,
					expected_balance_generation: 4,
					customer_entitlement_deductions: [],
					balance_key_index_by_feature_id: { emails: 5 },
					feature_id: "emails",
					idempotency_ttl_ms: 60_000,
				}),
			),
		) as { error: string };
		expect(staleTrack.error).toBe("BALANCE_GENERATION_CHANGED");
		expect(await redis.exists(keys.idempotency)).toBe(0);
	});
});

afterAll(async () => {
	await redis.del(...Object.values(keys));
	redis.disconnect();
});
