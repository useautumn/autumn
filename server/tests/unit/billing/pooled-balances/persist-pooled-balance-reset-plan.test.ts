import { expect, mock, test } from "bun:test";
import {
	EntInterval,
	type FullCusEntWithProduct,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { computePooledBalanceResetPlan } from "@/internal/billing/v2/pooledBalances/reset/computePooledBalanceResetPlan.js";
import { persistPooledBalanceResetPlan } from "@/internal/billing/v2/pooledBalances/reset/persistPooledBalanceResetPlan.js";

const RESET_AT = Date.UTC(2027, 0, 1);

const buildPlan = () => {
	const customerEntitlement: FullCusEntWithProduct = {
		...customerEntitlements.create({
			id: "cus_ent_pool",
			featureId: "messages",
			featureName: "Messages",
			allowance: 0,
			balance: 125,
			interval: EntInterval.Month,
			nextResetAt: RESET_AT,
			rollover: {
				max: null,
				duration: RolloverExpiryDurationType.Month,
				length: 1,
			},
		}),
		customer_product_id: null,
		customer_product: null,
	};

	const plan = computePooledBalanceResetPlan({
		customerEntitlement,
		resetAt: RESET_AT,
		lastAppliedResetAt: null,
		contributions: [
			{
				id: "contribution",
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
		],
	});
	if (!plan) throw new Error("Expected a pooled reset plan");
	return plan;
};

type InsertRolloversParam = {
	rolloverInsert: NonNullable<ReturnType<typeof buildPlan>["rolloverInsert"]>;
	startingBalance: number;
};

test("an optimistic-reset loser cannot insert a duplicate rollover", async () => {
	const insertRollovers = mock(
		async (_params: InsertRolloversParam) => undefined,
	);

	const applied = await persistPooledBalanceResetPlan({
		plan: buildPlan(),
		applyReset: async () => false,
		insertRollovers,
	});

	expect(applied).toBe(false);
	expect(insertRollovers).not.toHaveBeenCalled();
});

test("the reset winner inserts rollover work once with the pooled grant", async () => {
	const insertRollovers = mock(
		async (_params: InsertRolloversParam) => undefined,
	);

	const applied = await persistPooledBalanceResetPlan({
		plan: buildPlan(),
		applyReset: async () => true,
		insertRollovers,
	});

	expect(applied).toBe(true);
	expect(insertRollovers).toHaveBeenCalledTimes(1);
	expect(insertRollovers.mock.calls[0]?.[0]).toMatchObject({
		startingBalance: 500,
		rolloverInsert: {
			rows: [{ balance: 125 }],
		},
	});
});
