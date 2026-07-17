import { expect, test } from "bun:test";
import {
	EntInterval,
	type FullCusEntWithProduct,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { computePooledBalanceResetPlan } from "@/internal/billing/v2/pooledBalances/reset/computePooledBalanceResetPlan.js";
import { cusEntToEffectiveRolloverMax } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";

const RESET_AT = Date.UTC(2027, 0, 1);
const NEXT_EXPIRY = Date.UTC(2027, 1, 1);

const buildCustomerEntitlement = ({
	balance,
	interval = EntInterval.Month,
}: {
	balance: number;
	interval?: EntInterval;
}): FullCusEntWithProduct => ({
	...customerEntitlements.create({
		id: "cus_ent_pool",
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance,
		interval,
		nextResetAt: RESET_AT,
		rollover: {
			max: null,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	}),
	customer_product_id: null,
	customer_product: null,
});

const contributions = [
	{
		id: "contribution_a",
		currentCycleContribution: 500,
		nextCycleContribution: 500,
	},
	{
		id: "contribution_b",
		currentCycleContribution: 300,
		nextCycleContribution: 300,
	},
];

test("an unused pooled balance rolls the full pre-reset balance forward", () => {
	const customerEntitlement = buildCustomerEntitlement({ balance: 800 });
	const plan = computePooledBalanceResetPlan({
		customerEntitlement,
		resetAt: RESET_AT,
		lastAppliedResetAt: null,
		contributions,
	});

	expect(plan?.reset.resetBalance).toBe(800);
	expect(plan?.rolloverInsert?.rows).toHaveLength(1);
	expect(plan?.rolloverInsert?.startingBalanceOverride).toBe(800);
	expect(plan?.rolloverInsert?.rows[0]).toMatchObject({
		cus_ent_id: customerEntitlement.id,
		balance: 800,
		usage: 0,
		expires_at: NEXT_EXPIRY,
		entities: {},
	});
});

test("a partially used pooled balance only rolls its remaining balance forward", () => {
	const plan = computePooledBalanceResetPlan({
		customerEntitlement: buildCustomerEntitlement({ balance: 125 }),
		resetAt: RESET_AT,
		lastAppliedResetAt: null,
		contributions,
	});

	expect(plan?.rolloverInsert?.rows[0]?.balance).toBe(125);
});

test("a depleted pooled balance does not create a zero-value rollover", () => {
	const plan = computePooledBalanceResetPlan({
		customerEntitlement: buildCustomerEntitlement({ balance: 0 }),
		resetAt: RESET_AT,
		lastAppliedResetAt: null,
		contributions,
	});

	expect(plan?.rolloverInsert).toBeUndefined();
});

test("replaying an applied boundary cannot create another rollover", () => {
	expect(
		computePooledBalanceResetPlan({
			customerEntitlement: buildCustomerEntitlement({ balance: 800 }),
			resetAt: RESET_AT,
			lastAppliedResetAt: RESET_AT,
			contributions,
		}),
	).toBeNull();
});

test("lifetime pooled balances never produce reset or rollover work", () => {
	expect(
		computePooledBalanceResetPlan({
			customerEntitlement: buildCustomerEntitlement({
				balance: 800,
				interval: EntInterval.Lifetime,
			}),
			resetAt: RESET_AT,
			lastAppliedResetAt: null,
			contributions,
		}),
	).toBeNull();
});

test("pooled rollover caps reject invalid contribution-backed grants", () => {
	const customerEntitlement = buildCustomerEntitlement({ balance: 800 });
	customerEntitlement.entitlement.rollover = {
		max_percentage: 100,
		duration: RolloverExpiryDurationType.Month,
		length: 1,
	};

	for (const startingBalanceOverride of [
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	]) {
		expect(() =>
			cusEntToEffectiveRolloverMax({
				cusEnt: customerEntitlement,
				startingBalanceOverride,
			}),
		).toThrow("startingBalanceOverride must be finite and non-negative");
	}
});

test("pooled rollover caps reject a computed maximum that overflows", () => {
	const customerEntitlement = buildCustomerEntitlement({ balance: 800 });
	customerEntitlement.entitlement.rollover = {
		max_percentage: 200,
		duration: RolloverExpiryDurationType.Month,
		length: 1,
	};

	expect(() =>
		cusEntToEffectiveRolloverMax({
			cusEnt: customerEntitlement,
			startingBalanceOverride: 1e308,
		}),
	).toThrow("effectiveRolloverMax must be finite and non-negative");
});
