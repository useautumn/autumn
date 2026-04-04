import { describe, expect, test } from "bun:test";
import { type AnchorResetRefund, EntInterval } from "@autumn/shared";
import { toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";
import { augmentBillingContextForAnchorResetRefund } from "@/internal/billing/v2/utils/lineItems/augmentBillingContextForAnchorResetRefund";

const monthlyRefundCycle: AnchorResetRefund = {
	noPartialRefund: true,
	refundCycle: { interval: EntInterval.Month, intervalCount: 1 },
};

const yearlyRefundCycle: AnchorResetRefund = {
	noPartialRefund: true,
	refundCycle: { interval: EntInterval.Year, intervalCount: 1 },
};

const noCarryOverRefund: AnchorResetRefund = {
	noPartialRefund: true,
};

describe("augmentBillingContextForAnchorResetRefund", () => {
	test("returns no_adjustment when anchorResetRefund is undefined", () => {
		const result = augmentBillingContextForAnchorResetRefund({
			currentEpochMs: toUnix({ year: 2026, month: 3, day: 15 }),
			billingPeriod: {
				start: toUnix({ year: 2026, month: 1, day: 1 }),
				end: toUnix({ year: 2027, month: 1, day: 1 }),
			},
			anchorResetRefund: undefined,
		});

		expect(result.type).toBe("no_adjustment");
	});

	test("returns skip when noPartialRefund but no refundCycle (no carry_over)", () => {
		const result = augmentBillingContextForAnchorResetRefund({
			currentEpochMs: toUnix({ year: 2026, month: 3, day: 15 }),
			billingPeriod: {
				start: toUnix({ year: 2026, month: 1, day: 1 }),
				end: toUnix({ year: 2027, month: 1, day: 1 }),
			},
			anchorResetRefund: noCarryOverRefund,
		});

		expect(result.type).toBe("skip");
	});

	describe("monthly plan mid-cycle (billingPeriod = 1 month)", () => {
		test("14 days in -> snappedNow = period end -> skip", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 1, day: 15 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2026, month: 2, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("skip");
		});
	});

	describe("annual plan with monthly entitlements", () => {
		test("2.5 months in -> snappedNow = Apr 1", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 3, day: 15 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("use_snapped_now");
			if (result.type === "use_snapped_now") {
				expect(result.snappedNow).toBe(
					toUnix({ year: 2026, month: 4, day: 1 }),
				);
			}
		});

		test("exactly 3 months in (boundary) -> snappedNow = Apr 1 (not May 1)", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 4, day: 1 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("use_snapped_now");
			if (result.type === "use_snapped_now") {
				expect(result.snappedNow).toBe(
					toUnix({ year: 2026, month: 4, day: 1 }),
				);
			}
		});

		test("11.5 months in -> snappedNow = period end -> skip", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 12, day: 15 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("skip");
		});
	});

	describe("annual plan with yearly entitlements", () => {
		test("2.5 months in -> snappedNow = period end -> skip (0 full years)", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 3, day: 15 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: yearlyRefundCycle,
			});

			expect(result.type).toBe("skip");
		});
	});

	describe("semi-annual plan with monthly entitlements", () => {
		test("2.5 months in -> snappedNow = Apr 1", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 3, day: 15 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2026, month: 7, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("use_snapped_now");
			if (result.type === "use_snapped_now") {
				expect(result.snappedNow).toBe(
					toUnix({ year: 2026, month: 4, day: 1 }),
				);
			}
		});
	});

	describe("edge cases", () => {
		test("now at period start -> snappedNow = period start (full refund)", () => {
			const periodStart = toUnix({ year: 2026, month: 1, day: 1 });
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: periodStart,
				billingPeriod: {
					start: periodStart,
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("use_snapped_now");
			if (result.type === "use_snapped_now") {
				expect(result.snappedNow).toBe(periodStart);
			}
		});

		test("now at period end -> skip", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2027, month: 1, day: 1 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("skip");
		});

		test("exactly 1 month before period end -> snappedNow = Dec 1", () => {
			const result = augmentBillingContextForAnchorResetRefund({
				currentEpochMs: toUnix({ year: 2026, month: 12, day: 1 }),
				billingPeriod: {
					start: toUnix({ year: 2026, month: 1, day: 1 }),
					end: toUnix({ year: 2027, month: 1, day: 1 }),
				},
				anchorResetRefund: monthlyRefundCycle,
			});

			expect(result.type).toBe("use_snapped_now");
			if (result.type === "use_snapped_now") {
				expect(result.snappedNow).toBe(
					toUnix({ year: 2026, month: 12, day: 1 }),
				);
			}
		});
	});
});
