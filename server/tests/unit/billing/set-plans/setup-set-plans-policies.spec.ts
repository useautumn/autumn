import { expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	type FreeTrial,
	ms,
} from "@autumn/shared";
import type Stripe from "stripe";
import { setupSetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansPolicies";

const billingContextWith = (
	overrides: Partial<CreateScheduleBillingContext>,
): CreateScheduleBillingContext =>
	({
		currentEpochMs: 0,
		immediatePhase: { starts_at: 0, plans: [] },
		...overrides,
	}) as unknown as CreateScheduleBillingContext;

test("live rows carry with or without a requested trial, which is patched onto them", () => {
	const withTrial = billingContextWith({
		trialContext: {
			trialEndsAt: 1_790_000_000_000,
			customFreeTrial: { length: 14 } as FreeTrial,
			appliesToBilling: true,
			cardRequired: true,
		},
	});

	expect(
		setupSetPlansPolicies({ billingContext: withTrial, params: {} }).liveRows,
	).toBe("carry");
	expect(
		setupSetPlansPolicies({
			billingContext: billingContextWith({}),
			params: {},
		}).liveRows,
	).toBe("carry");
});

test("a future first phase ends undeclared live plans now, even when asked to retain them", () => {
	const currentEpochMs = 1_800_000_000_000;
	const startingAt = (startsAt: number) =>
		billingContextWith({
			currentEpochMs,
			immediatePhase: { starts_at: startsAt, plans: [] },
		});

	expect(
		setupSetPlansPolicies({
			billingContext: startingAt(currentEpochMs + ms.days(7)),
			params: { undeclared_plans: "retain" },
		}).undeclared,
	).toBe("end");
	expect(
		setupSetPlansPolicies({
			billingContext: startingAt(currentEpochMs),
			params: { undeclared_plans: "retain" },
		}).undeclared,
	).toBe("retain");
});

test("a backdate over a healthy subscription carries its live rows onto the recreated one", () => {
	const currentEpochMs = 1_800_000_000_000;
	const backdatedOver = (status: Stripe.Subscription.Status) =>
		billingContextWith({
			currentEpochMs,
			immediatePhase: { starts_at: currentEpochMs - ms.days(20), plans: [] },
			subscriptionBackdateStartMs: currentEpochMs - ms.days(20),
			replacedStripeSubscription: {
				id: "sub_live",
				status,
			} as Stripe.Subscription,
		});

	expect(
		setupSetPlansPolicies({
			billingContext: backdatedOver("active"),
			params: {},
		}).liveRows,
	).toBe("carry");
	expect(
		setupSetPlansPolicies({
			billingContext: backdatedOver("unpaid"),
			params: {},
		}).liveRows,
	).toBe("recreate");
});

test("a backdate that restarts the cycle on its start recreates the live rows, so their paid time is credited", () => {
	const currentEpochMs = 1_800_000_000_000;
	const backdatedStart = currentEpochMs - ms.days(20);

	expect(
		setupSetPlansPolicies({
			billingContext: billingContextWith({
				currentEpochMs,
				immediatePhase: {
					starts_at: backdatedStart,
					plans: [],
					billing_cycle_anchor: "phase_start",
				},
				subscriptionBackdateStartMs: backdatedStart,
				replacedStripeSubscription: {
					id: "sub_live",
					status: "active",
				} as Stripe.Subscription,
			}),
			params: {},
		}).liveRows,
	).toBe("recreate");
});

test("a cycle reset now recreates renewing live rows, so kept plans are re-billed", () => {
	expect(
		setupSetPlansPolicies({
			billingContext: billingContextWith({
				requestedBillingCycleAnchor: "now",
			}),
			params: {},
		}).liveRows,
	).toBe("recreateRenewing");
});

test("a scheduled anchor keeps live rows carrying until the reset", () => {
	expect(
		setupSetPlansPolicies({
			billingContext: billingContextWith({
				requestedBillingCycleAnchor: 1_800_000_000_000,
			}),
			params: {},
		}).liveRows,
	).toBe("carry");
});
