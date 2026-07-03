import { describe, expect, test } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import { getBillingCycleAnchorResetAt } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";

const customerProductWithResetAt = (
	billingCycleAnchorResetsAt: number | null,
) =>
	({
		billing_cycle_anchor_resets_at: billingCycleAnchorResetsAt,
	}) as FullCusProduct;

describe("getBillingCycleAnchorResetAt", () => {
	test("keeps a reset timestamp that starts at the current phase", () => {
		const now = Date.UTC(2026, 6, 22, 11);

		expect(
			getBillingCycleAnchorResetAt({
				customerProducts: [customerProductWithResetAt(now)],
				nowMs: now,
			}),
		).toBe(now);
	});

	test("ignores reset timestamps before the current phase", () => {
		const now = Date.UTC(2026, 6, 22, 11);

		expect(
			getBillingCycleAnchorResetAt({
				customerProducts: [customerProductWithResetAt(now - 1000)],
				nowMs: now,
			}),
		).toBeUndefined();
	});
});
