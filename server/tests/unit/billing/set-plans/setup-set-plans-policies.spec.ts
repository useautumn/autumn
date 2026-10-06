/** set_plans resolves once how the diff treats live rows; resetting the cycle now restarts every live plan. */

import { describe, expect, test } from "bun:test";
import type { CreateScheduleBillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import { setupSetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansPolicies";

const NOW = Date.UTC(2027, 2, 15, 12);

const billingContextFor = ({
	requestedBillingCycleAnchor,
	replacedStripeSubscription,
}: Partial<
	Pick<
		CreateScheduleBillingContext,
		"requestedBillingCycleAnchor" | "replacedStripeSubscription"
	>
>) =>
	({
		currentEpochMs: NOW,
		immediatePhase: { starts_at: NOW },
		requestedBillingCycleAnchor,
		replacedStripeSubscription,
	}) as CreateScheduleBillingContext;

const liveRowsFor = (billingContext: CreateScheduleBillingContext) =>
	setupSetPlansPolicies({ billingContext, params: {} }).liveRows;

describe("setupSetPlansPolicies liveRows", () => {
	test("live rows carry on a live subscription", () => {
		expect(liveRowsFor(billingContextFor({}))).toBe("carry");
	});

	test("a cycle reset now recreates live rows, so kept plans are re-billed", () => {
		expect(
			liveRowsFor(billingContextFor({ requestedBillingCycleAnchor: "now" })),
		).toBe("recreate");
	});

	test("a scheduled anchor keeps live rows carrying until the reset", () => {
		expect(
			liveRowsFor(
				billingContextFor({ requestedBillingCycleAnchor: NOW + 86_400_000 }),
			),
		).toBe("carry");
	});

	test("a canceled replaced subscription recreates only when a paid plan starts", () => {
		expect(
			liveRowsFor(
				billingContextFor({
					replacedStripeSubscription: {
						id: "sub_canceled",
						status: "canceled",
					} as Stripe.Subscription,
				}),
			),
		).toBe("recreateWhenPaidRecurringStarts");
	});
});
