/**
 * Contract: a metered feature a credit system prices at 0 credits is free.
 * Tracking or locking it through the Redis deduction script leaves the credit
 * balance untouched — whatever that balance is, whether the row is unlimited,
 * and whatever rollovers it carries — while the feature's own balances are
 * still drawn first. A plan item's feature_override decides the price: it can
 * make a priced feature free, or price a catalog-free one.
 *
 * Runs the real `deductFromSubjectBalances` Lua script, with params prepared by
 * `prepareFeatureDeductionV2`, against a local Redis.
 */

import { afterAll, describe, expect, test } from "bun:test";
import type { FullSubject, LockParams } from "@autumn/shared";
import { rollovers } from "@tests/utils/fixtures/db/rollovers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepareFeatureDeductionV2 } from "@/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.js";
import type { LuaDeductionResult } from "@/internal/balances/utils/types/redisDeductionResult.js";
import { buildDeductFromSubjectBalancesKeys } from "@/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import {
	cachedBalance,
	createZeroCreditCostRedis,
	creditRow,
	customerId,
	messagesFeature,
	messagesOverride,
	ownRow,
	setupZeroCreditCostSubject,
} from "./zeroCreditCostFixtures.js";

const redis = createZeroCreditCostRedis({ region: "test:zero-credit-cost" });

const balanceOf = (
	ctx: AutumnContext,
	row: Parameters<typeof cachedBalance>[0]["row"],
	rolloverId?: string,
) => cachedBalance({ redis, ctx, row, rolloverId });

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

describe("zero credit cost (Redis deduction script)", () => {
	test("a track of a free feature leaves the credit balance untouched", async () => {
		const credits = creditRow({ balance: 300 });
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [credits],
		});

		const result = await deduct({ ctx, fullSubject, value: 1 });

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await balanceOf(ctx, credits)).toBe(300);
	});

	test("a free feature is never rejected, even with no credits left", async () => {
		const credits = creditRow({ balance: 0 });
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [credits],
		});

		const result = await deduct({
			ctx,
			fullSubject,
			value: 4,
			overageBehaviour: "reject",
		});

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await balanceOf(ctx, credits)).toBe(0);
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
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [own, credits],
		});

		const result = await deduct({ ctx, fullSubject, value: 5 });

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await balanceOf(ctx, own)).toBe(0);
		expect(await balanceOf(ctx, credits)).toBe(100);
		expect(await balanceOf(ctx, credits, "rollover_credits")).toBe(50);
	});

	test("a refund lifts the feature's own balance before the free credit row absorbs what is left", async () => {
		const own = ownRow({ balance: 4, allowance: 10 });
		const credits = creditRow({ balance: 100 });
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [own, credits],
		});

		const result = await deduct({ ctx, fullSubject, value: -3 });

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await balanceOf(ctx, own)).toBe(7);
		expect(await balanceOf(ctx, credits)).toBe(100);
	});

	test("an unlimited credit row does not count free usage", async () => {
		const credits = creditRow({ balance: 0, unlimited: true });
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [credits],
		});

		const result = await deduct({ ctx, fullSubject, value: 3 });

		expect(result.error ?? null).toBeNull();
		expect(await balanceOf(ctx, credits)).toBe(0);
	});

	test("a lock on a free feature holds its units at no credits, and releasing or confirming it moves none", async () => {
		for (const [index, finalize] of [
			{ unwindValue: 1, additionalValue: 0 },
			{ unwindValue: 0, additionalValue: 2 },
		].entries()) {
			const credits = creditRow({ balance: 600 });
			const { ctx, fullSubject } = await setupZeroCreditCostSubject({
				redis,
				rows: [credits],
			});

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
			expect(await balanceOf(ctx, credits)).toBe(600);

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
			expect(await balanceOf(ctx, credits)).toBe(600);
		}
	});

	test("a priced feature still pays its rate (control)", async () => {
		const credits = creditRow({ balance: 300, creditAmount: 5 });
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [credits],
		});

		const result = await deduct({ ctx, fullSubject, value: 2 });

		expect(result.error ?? null).toBeNull();
		expect(await balanceOf(ctx, credits)).toBe(290);
	});
});

describe("zero credit cost through a plan item feature_override (Redis deduction script)", () => {
	test("an override pricing a catalog-priced feature at 0 makes it free", async () => {
		const credits = creditRow({
			balance: 0,
			creditAmount: 5,
			featureOverride: messagesOverride({ creditAmount: 0 }),
		});
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [credits],
		});

		const result = await deduct({
			ctx,
			fullSubject,
			value: 3,
			overageBehaviour: "reject",
		});

		expect(result.error ?? null).toBeNull();
		expect(result.remaining).toBe(0);
		expect(await balanceOf(ctx, credits)).toBe(0);
	});

	test("an override pricing a catalog-free feature charges the override's rate", async () => {
		const credits = creditRow({
			balance: 300,
			creditAmount: 0,
			featureOverride: messagesOverride({ creditAmount: 5 }),
		});
		const { ctx, fullSubject } = await setupZeroCreditCostSubject({
			redis,
			rows: [credits],
		});

		const result = await deduct({ ctx, fullSubject, value: 2 });

		expect(result.error ?? null).toBeNull();
		expect(await balanceOf(ctx, credits)).toBe(290);
	});
});

afterAll(async () => {
	await redis.quit();
});
