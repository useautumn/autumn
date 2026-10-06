/**
 * Contract: a metered feature a credit system prices at 0 credits is free.
 * Tracking or locking it through the Redis deduction script leaves the credit
 * balance untouched — whatever that balance is, whether the row is unlimited,
 * and whatever rollovers it carries — while the feature's own balances are
 * still drawn first.
 *
 * Runs the real `deductFromSubjectBalances` Lua script, with params prepared by
 * `prepareFeatureDeductionV2`, against a local Redis.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	FeatureType,
	type FullCustomerEntitlement,
	type FullSubject,
	fullCustomerToFullSubject,
	type LockParams,
	type NormalizedFullSubject,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { rollovers } from "@tests/utils/fixtures/db/rollovers.js";
import { createRedisClient } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepareFeatureDeductionV2 } from "@/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.js";
import type { LuaDeductionResult } from "@/internal/balances/utils/types/redisDeductionResult.js";
import { buildSharedBalanceWrites } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setSharedFullSubjectBalances.js";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";

const redis = createRedisClient({
	cacheUrl: process.env.HANDOFF_TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
	region: "test:zero-credit-cost",
	redisType: "subject-primary",
});

const customerId = "cus_test";
const messagesFeature = features.create({ id: "messages", name: "Messages" });

const creditRow = ({
	balance,
	unlimited = false,
	creditAmount = 0,
}: {
	balance: number;
	unlimited?: boolean;
	creditAmount?: number;
}) => {
	const row = customerEntitlements.create({
		id: "credits_row",
		featureId: "credits",
		featureName: "Credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: {
			schema: [
				{
					metered_feature_id: "messages",
					feature_amount: 1,
					credit_amount: creditAmount,
				},
			],
		},
		allowance: balance,
		balance,
		usageAllowed: false,
	});
	row.unlimited = unlimited;
	return row;
};

const ownRow = ({ balance }: { balance: number }) =>
	customerEntitlements.create({
		id: "own_row",
		featureId: "messages",
		featureName: "Messages",
		allowance: balance,
		balance,
		usageAllowed: false,
	});

const setup = async ({ rows }: { rows: FullCustomerEntitlement[] }) => {
	const fullSubject: FullSubject = fullCustomerToFullSubject({
		fullCustomer: customers.create({
			customerProducts: [
				customerProducts.create({ customerEntitlements: rows }),
			],
		}),
	});
	const creditsFeature = rows.find((row) => row.feature_id === "credits")
		?.entitlement.feature;
	const ctx = contexts.create({
		features: [messagesFeature, ...(creditsFeature ? [creditsFeature] : [])],
	});
	ctx.redisV2 = redis;
	ctx.timestamp = Date.now();

	const multi = redis.multi();
	for (const { balanceKey, fields } of buildSharedBalanceWrites({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		customerEntitlements:
			rows as unknown as NormalizedFullSubject["customer_entitlements"],
		aggregatedCustomerEntitlements: [],
	})) {
		multi.del(balanceKey).hset(balanceKey, fields);
	}
	await multi.exec();

	return { ctx, fullSubject };
};

const deduct = async ({
	ctx,
	fullSubject,
	value,
	overageBehaviour = "cap",
	lock,
	finalize,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	value: number;
	overageBehaviour?: "cap" | "reject";
	lock?: LockParams;
	/** Finalize an open lock: give back `unwindValue` of it, then deduct `value` more. */
	finalize?: { lockReceiptKey: string; unwindValue: number };
}): Promise<LuaDeductionResult & { lockReceiptKey: string | null }> => {
	const prepared = prepareFeatureDeductionV2({
		ctx,
		fullSubject,
		deduction: { feature: messagesFeature, deduction: value, lock },
		options: { overageBehaviour },
	});
	const lockReceiptKey =
		finalize?.lockReceiptKey ?? prepared.lock?.redis_receipt_key ?? null;
	if (prepared.lock) await redis.del(prepared.lock.redis_receipt_key);

	const { keys, balanceKeyIndexByFeatureId } =
		buildDeductFromSubjectBalancesKeys({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			routingKey: buildFullSubjectKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
			}),
			lockReceiptKey,
			customerEntitlementDeductions: prepared.customerEntitlementDeductions,
			fallbackFeatureId: messagesFeature.id,
		});
	const raw = await redis.deductFromSubjectBalances(
		keys.length,
		...keys,
		JSON.stringify({
			org_id: ctx.org.id,
			env: ctx.env,
			customer_id: customerId,
			customer_entitlement_deductions: prepared.customerEntitlementDeductions,
			balance_key_index_by_feature_id: balanceKeyIndexByFeatureId,
			usage_window_now: ctx.timestamp,
			is_consumption: value > 0,
			amount_to_deduct: value,
			target_balance: null,
			target_entity_id: null,
			rollovers: prepared.rollovers.length > 0 ? prepared.rollovers : null,
			skip_additional_balance: false,
			alter_granted_balance: false,
			overage_behaviour: overageBehaviour,
			feature_id: messagesFeature.id,
			lock: prepared.lock ?? null,
			unwind_value: finalize?.unwindValue ?? null,
		}),
	);
	return { ...(JSON.parse(raw) as LuaDeductionResult), lockReceiptKey };
};

/** The cached balance of a row after the script ran, or of a rollover on it. */
const cachedBalance = async ({
	ctx,
	row,
	rolloverId,
}: {
	ctx: AutumnContext;
	row: FullCustomerEntitlement;
	rolloverId?: string;
}) => {
	const [{ balanceKey }] = buildSharedBalanceWrites({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		customerEntitlements: [
			row,
		] as unknown as NormalizedFullSubject["customer_entitlements"],
		aggregatedCustomerEntitlements: [],
	});
	const cached = JSON.parse((await redis.hget(balanceKey, row.id)) ?? "{}");
	if (!rolloverId) return cached.balance;
	return cached.rollovers.find(
		(rollover: { id: string }) => rollover.id === rolloverId,
	)?.balance;
};

beforeEach(async () => {
	await redis.ping();
});

describe("zero credit cost (Redis deduction script)", () => {
	test("a track of a free feature leaves the credit balance untouched", async () => {
		const credits = creditRow({ balance: 300 });
		const { ctx, fullSubject } = await setup({ rows: [credits] });

		const result = await deduct({ ctx, fullSubject, value: 1 });

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await cachedBalance({ ctx, row: credits })).toBe(300);
	});

	test("a free feature is never rejected, even with no credits left", async () => {
		const credits = creditRow({ balance: 0 });
		const { ctx, fullSubject } = await setup({ rows: [credits] });

		const result = await deduct({
			ctx,
			fullSubject,
			value: 4,
			overageBehaviour: "reject",
		});

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await cachedBalance({ ctx, row: credits })).toBe(0);
	});

	test("the feature's own balance is drawn first, then the credit system funds the rest for free", async () => {
		const own = ownRow({ balance: 3 });
		const credits = creditRow({ balance: 100 });
		credits.rollovers = [
			rollovers.create({
				id: "rollover_credits",
				cusEntId: credits.id,
				balance: 50,
			}),
		];
		const { ctx, fullSubject } = await setup({ rows: [own, credits] });

		const result = await deduct({ ctx, fullSubject, value: 5 });

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await cachedBalance({ ctx, row: own })).toBe(0);
		expect(await cachedBalance({ ctx, row: credits })).toBe(100);
		expect(
			await cachedBalance({
				ctx,
				row: credits,
				rolloverId: "rollover_credits",
			}),
		).toBe(50);
	});

	test("a refund lifts the feature's own balance before the free credit row absorbs what is left", async () => {
		const own = ownRow({ balance: 4 });
		own.entitlement.allowance = 10;
		const credits = creditRow({ balance: 100 });
		const { ctx, fullSubject } = await setup({ rows: [own, credits] });

		const result = await deduct({ ctx, fullSubject, value: -3 });

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await cachedBalance({ ctx, row: own })).toBe(7);
		expect(await cachedBalance({ ctx, row: credits })).toBe(100);
	});

	test("an unlimited credit row does not count free usage", async () => {
		const credits = creditRow({ balance: 0, unlimited: true });
		const { ctx, fullSubject } = await setup({ rows: [credits] });

		const result = await deduct({ ctx, fullSubject, value: 3 });

		expect(result.error ?? null).toBeNull();
		expect(await cachedBalance({ ctx, row: credits })).toBe(0);
	});

	test("a lock on a free feature holds its units at no credits, and releasing or confirming it moves none", async () => {
		for (const [index, finalize] of [
			{ unwindValue: 1, additionalValue: 0 },
			{ unwindValue: 0, additionalValue: 2 },
		].entries()) {
			const credits = creditRow({ balance: 600 });
			const { ctx, fullSubject } = await setup({ rows: [credits] });

			const locked = await deduct({
				ctx,
				fullSubject,
				value: 1,
				overageBehaviour: "reject",
				lock: {
					enabled: true,
					lock_id: `zero-credit-lock-${process.pid}-${index}`,
					expires_at: Date.now() + 60_000,
				},
			});
			expect(locked.error ?? null).toBeNull();
			expect(await cachedBalance({ ctx, row: credits })).toBe(600);

			const lockReceiptKey = locked.lockReceiptKey ?? "";
			const receipt = JSON.parse((await redis.get(lockReceiptKey)) ?? "{}");
			expect(receipt.items).toEqual([
				expect.objectContaining({
					customer_entitlement_id: credits.id,
					credit_cost: 0,
					balance_delta: 0,
					value_delta: 1,
				}),
			]);

			const finalized = await deduct({
				ctx,
				fullSubject,
				value: finalize.additionalValue,
				overageBehaviour: "reject",
				finalize: { lockReceiptKey, unwindValue: finalize.unwindValue },
			});
			expect(finalized.error ?? null).toBeNull();
			expect(await cachedBalance({ ctx, row: credits })).toBe(600);
		}
	});

	test("a priced feature still pays its rate (control)", async () => {
		const credits = creditRow({ balance: 300, creditAmount: 5 });
		const { ctx, fullSubject } = await setup({ rows: [credits] });

		const result = await deduct({ ctx, fullSubject, value: 2 });

		expect(result.error ?? null).toBeNull();
		expect(await cachedBalance({ ctx, row: credits })).toBe(290);
	});
});

afterAll(async () => {
	await redis.quit();
});
