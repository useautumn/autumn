import { describe, expect, test } from "bun:test";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { isOrphanedBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/common/billingCycleAnchorReset/isOrphanedBillingCycleAnchorReset";

const nowMs = Date.UTC(2026, 9, 6, 12);
const resetsAt = Date.UTC(2026, 9, 16, 12, 0, 0, 500);

const subscriptionWithPhases = (
	phases: { start_date: number; billing_cycle_anchor: string | null }[] | null,
) =>
	({
		schedule: phases === null ? null : { phases },
	}) as unknown as ExpandedStripeSubscription;

describe("isOrphanedBillingCycleAnchorReset", () => {
	test("a pending reset the live schedule still restarts at, in that second, is kept", () => {
		expect(
			isOrphanedBillingCycleAnchorReset({
				customerProduct: { billing_cycle_anchor_resets_at: resetsAt },
				stripeSubscription: subscriptionWithPhases([
					{ start_date: nowMs / 1000, billing_cycle_anchor: null },
					{
						start_date: Math.floor(resetsAt / 1000),
						billing_cycle_anchor: "phase_start",
					},
				]),
				nowMs,
			}),
		).toBe(false);
	});

	test("a pending reset on a released schedule is orphaned", () => {
		expect(
			isOrphanedBillingCycleAnchorReset({
				customerProduct: { billing_cycle_anchor_resets_at: resetsAt },
				stripeSubscription: subscriptionWithPhases(null),
				nowMs,
			}),
		).toBe(true);
	});

	test("a schedule whose phase at the reset keeps the anchor no longer resets there", () => {
		expect(
			isOrphanedBillingCycleAnchorReset({
				customerProduct: { billing_cycle_anchor_resets_at: resetsAt },
				stripeSubscription: subscriptionWithPhases([
					{
						start_date: Math.floor(resetsAt / 1000),
						billing_cycle_anchor: null,
					},
				]),
				nowMs,
			}),
		).toBe(true);
	});

	test("a reset already due is left for the anchor move to consume", () => {
		expect(
			isOrphanedBillingCycleAnchorReset({
				customerProduct: { billing_cycle_anchor_resets_at: nowMs - 1000 },
				stripeSubscription: subscriptionWithPhases(null),
				nowMs,
			}),
		).toBe(false);
	});
});
