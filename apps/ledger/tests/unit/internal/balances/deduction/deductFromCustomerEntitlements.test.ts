import { describe, expect, it } from "bun:test";
import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { deductFromCustomerEntitlements } from "../../../../../src/internal/balances/deduction/deductFromCustomerEntitlements.js";
import type { DeductionOptions } from "../../../../../src/internal/balances/deduction/types/deductionOptions.js";
import {
	customerEntitlementFixture,
	featureFixture,
} from "../../../testUtils/customerEntitlementFixture.js";

const feature = featureFixture();

const optionsOf = (isAllow = false): DeductionOptions => ({
	overageBehaviour: isAllow ? "allow" : "cap",
	isAllow,
	isConsumption: true,
});

const deduct = ({
	customerEntitlements,
	amount,
	isAllow = false,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	amount: number;
	isAllow?: boolean;
}) =>
	deductFromCustomerEntitlements({
		customerEntitlements,
		requests: [{ feature, amount }],
		options: optionsOf(isAllow),
	});

describe("deductFromCustomerEntitlements", () => {
	it("refunds a negative balance to zero, then up to granted (deductFromMainBalanceV2.lua:30-43)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({ id: "ce_1", balance: -3, allowance: 100 }),
			],
			amount: -5,
		});

		// Pass 1 ceilings at 0 (+3), pass 2 ceilings at max_balance (+2).
		expect(result.balancesAfter.ce_1?.balance).toBe(2);
		expect(result.remainingByFeatureId.messages).toBe(0);
		expect(result.mutations.map((mutation) => mutation.balance_delta)).toEqual([
			3, 2,
		]);
	});

	it("stops a refund at max_balance + adjustment (deductFromMainBalanceV2.lua:39-43)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({ id: "ce_1", balance: 99, allowance: 100 }),
			],
			amount: -5,
		});

		expect(result.balancesAfter.ce_1?.balance).toBe(100);
		expect(result.remainingByFeatureId.messages).toBe(-4);
	});

	it("caps at zero when the only entitlement is not usage_allowed (runDeductionOnContextV2.lua:470)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({ id: "ce_1", balance: 10, allowance: 10 }),
			],
			amount: 15,
		});

		// Pass 2 skips the row, so the shortfall survives as `remaining`.
		expect(result.balancesAfter.ce_1?.balance).toBe(0);
		expect(result.remainingByFeatureId.messages).toBe(5);
	});

	it("lets `allow` promote a usage_allowed=false entitlement into the overage pass (runDeductionOnContextV2.lua:87)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({ id: "ce_1", balance: 10, allowance: 10 }),
			],
			amount: 15,
			isAllow: true,
		});

		// `usage_allowed or overage_behavior_is_allow` makes every row eligible,
		// and the allow branch drops the floor entirely.
		expect(result.balancesAfter.ce_1?.balance).toBe(-5);
		expect(result.remainingByFeatureId.messages).toBe(0);
	});

	it("splits overage across usage_allowed entitlements in order, each floored at min_balance (deductFromMainBalanceV2.lua:59-61)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({
					id: "ce_1",
					balance: 0,
					allowance: 0,
					usageAllowed: true,
					usageLimit: 2,
				}),
				customerEntitlementFixture({
					id: "ce_2",
					balance: 0,
					allowance: 0,
					usageAllowed: true,
					usageLimit: 5,
				}),
			],
			amount: 6,
		});

		expect(result.balancesAfter.ce_1?.balance).toBe(-2);
		expect(result.balancesAfter.ce_2?.balance).toBe(-4);
		expect(result.remainingByFeatureId.messages).toBe(0);
	});

	it("drains every entitlement in the included pass before any overage (runDeductionOnContextV2.lua:440-476)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({
					id: "ce_1",
					balance: 30,
					allowance: 30,
					usageAllowed: true,
				}),
				customerEntitlementFixture({
					id: "ce_2",
					balance: 100,
					allowance: 100,
				}),
			],
			amount: 50,
		});

		expect(result.balancesAfter.ce_1?.balance).toBe(0);
		expect(result.balancesAfter.ce_2?.balance).toBe(80);
		expect(result.remainingByFeatureId.messages).toBe(0);
	});

	it("sends everything to an unlimited leader and leaves finite siblings alone (runDeductionOnContextV2.lua:388-414)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({
					id: "ce_unlimited",
					balance: 0,
					unlimited: true,
				}),
				customerEntitlementFixture({
					id: "ce_2",
					balance: 100,
					allowance: 100,
				}),
			],
			amount: 7,
		});

		expect(result.balancesAfter.ce_unlimited?.balance).toBe(-7);
		expect(result.balancesAfter.ce_2?.balance).toBe(100);
		expect(result.remainingByFeatureId.messages).toBe(0);
		expect(result.mutations).toHaveLength(1);
	});

	it("hoists an unlimited row that the sort left behind (runDeductionOnContextV2.lua:388)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({
					id: "ce_1",
					balance: 100,
					allowance: 100,
				}),
				customerEntitlementFixture({
					id: "ce_unlimited",
					balance: 0,
					unlimited: true,
				}),
			],
			amount: 7,
		});

		expect(result.balancesAfter.ce_unlimited?.balance).toBe(-7);
		expect(result.balancesAfter.ce_1?.balance).toBe(100);
	});

	it("rounds the remainder to ten decimals (runDeductionOnContextV2.lua:478)", () => {
		const result = deduct({
			customerEntitlements: [
				customerEntitlementFixture({
					id: "ce_1",
					balance: 0.1,
					allowance: 0.1,
				}),
			],
			amount: 0.3,
		});

		expect(result.remainingByFeatureId.messages).toBe(0.2);
	});

	it("folds each request against what the previous one settled", () => {
		const credits = featureFixture("credits");
		const result = deductFromCustomerEntitlements({
			customerEntitlements: [
				customerEntitlementFixture({ id: "ce_1", balance: 10, allowance: 10 }),
				customerEntitlementFixture({
					id: "ce_2",
					balance: 4,
					allowance: 4,
					feature: credits,
				}),
			],
			requests: [
				{ feature, amount: 6 },
				{ feature: credits, amount: 6 },
			],
			options: optionsOf(),
		});

		expect(result.balancesAfter.ce_1?.balance).toBe(4);
		expect(result.balancesAfter.ce_2?.balance).toBe(0);
		expect(result.remainingByFeatureId).toEqual({ messages: 0, credits: 2 });
	});
});
