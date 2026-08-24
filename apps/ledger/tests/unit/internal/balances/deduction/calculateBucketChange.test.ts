import { describe, expect, it } from "bun:test";
import { calculateBucketChange } from "../../../../../src/internal/balances/deduction/calculateBucketChange.js";
import type { CustomerEntitlementDeduction } from "../../../../../src/internal/balances/deduction/types/customerEntitlementDeduction.js";
import type { DeductionBucket } from "../../../../../src/internal/balances/deduction/types/deductionBucket.js";

const customerEntitlementDeduction: CustomerEntitlementDeduction = {
	customer_entitlement_id: "ce_1",
	feature_id: "messages",
	credit_cost: 1,
	usage_allowed: true,
};

const bucket = ({
	kind,
	limit = null,
}: {
	kind: DeductionBucket["kind"];
	limit?: number | null;
}): DeductionBucket => ({ customerEntitlementDeduction, kind, limit });

describe("calculateBucketChange", () => {
	it("floors the included spend at zero (deductFromMainBalanceV2.lua:66-68)", () => {
		const included = bucket({ kind: "spend_included" });

		expect(
			calculateBucketChange({
				bucket: included,
				balance: { balance: 10, adjustment: 0 },
				amount: 15,
			}),
		).toBe(10);
		expect(
			calculateBucketChange({
				bucket: included,
				balance: { balance: 10, adjustment: 0 },
				amount: 5,
			}),
		).toBe(5);
		expect(
			calculateBucketChange({
				bucket: included,
				balance: { balance: -3, adjustment: 0 },
				amount: 5,
			}),
		).toBe(0);
	});

	it("deducts the full amount when the overage spend has no floor (deductFromMainBalanceV2.lua:57-58, 62-63)", () => {
		expect(
			calculateBucketChange({
				bucket: bucket({ kind: "spend_overage" }),
				balance: { balance: 0, adjustment: 0 },
				amount: 5,
			}),
		).toBe(5);
	});

	it("floors the overage spend at min_balance (deductFromMainBalanceV2.lua:59-61)", () => {
		const overage = bucket({ kind: "spend_overage", limit: -20 });

		expect(
			calculateBucketChange({
				bucket: overage,
				balance: { balance: 0, adjustment: 0 },
				amount: 5,
			}),
		).toBe(5);
		expect(
			calculateBucketChange({
				bucket: overage,
				balance: { balance: -18, adjustment: 0 },
				amount: 5,
			}),
		).toBe(2);
		expect(
			calculateBucketChange({
				bucket: overage,
				balance: { balance: -20, adjustment: 0 },
				amount: 5,
			}),
		).toBe(0);
	});

	it("ceilings a refund's overage pass at zero (deductFromMainBalanceV2.lua:30-34)", () => {
		const refundOverage = bucket({ kind: "refund_overage" });

		expect(
			calculateBucketChange({
				bucket: refundOverage,
				balance: { balance: -3, adjustment: 0 },
				amount: -5,
			}),
		).toBe(-3);
		expect(
			calculateBucketChange({
				bucket: refundOverage,
				balance: { balance: 10, adjustment: 0 },
				amount: -5,
			}),
		).toBe(0);
	});

	it("ceilings the included refund at max_balance + adjustment (deductFromMainBalanceV2.lua:39-43)", () => {
		expect(
			calculateBucketChange({
				bucket: bucket({ kind: "refund_included", limit: 100 }),
				balance: { balance: 95, adjustment: 0 },
				amount: -5,
			}),
		).toBe(-5);
		expect(
			calculateBucketChange({
				bucket: bucket({ kind: "refund_included", limit: 100 }),
				balance: { balance: 118, adjustment: 20 },
				amount: -5,
			}),
		).toBe(-2);
		expect(
			calculateBucketChange({
				bucket: bucket({ kind: "refund_included" }),
				balance: { balance: 118, adjustment: 0 },
				amount: -5,
			}),
		).toBe(-5);
	});

	it("absorbs the whole amount in an unlimited bucket (runDeductionOnContextV2.lua:392-405)", () => {
		expect(
			calculateBucketChange({
				bucket: bucket({ kind: "unlimited" }),
				balance: { balance: 0, adjustment: 0 },
				amount: 5,
			}),
		).toBe(5);
		expect(
			calculateBucketChange({
				bucket: bucket({ kind: "unlimited" }),
				balance: { balance: -5, adjustment: 0 },
				amount: -12,
			}),
		).toBe(-12);
	});
});
