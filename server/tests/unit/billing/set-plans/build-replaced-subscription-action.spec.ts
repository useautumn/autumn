/** set_plans cancels a replaced subscription only while it is still open in Stripe. */

import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { buildReplacedSubscriptionAction } from "@/internal/billing/v2/actions/setPlans/utils/buildReplacedSubscriptionAction";

const subscription = (status: Stripe.Subscription.Status) =>
	({ id: `sub_${status}`, status }) as Stripe.Subscription;

describe("buildReplacedSubscriptionAction", () => {
	test("an open unusable subscription is cancelled", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: subscription("paused"),
			}),
		).toEqual({ type: "cancel", stripeSubscriptionId: "sub_paused" });
	});

	test("an active subscription a future start replaces is cancelled", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: subscription("active"),
			}),
		).toEqual({ type: "cancel", stripeSubscriptionId: "sub_active" });
	});

	test("a healthy subscription replaced for a backdate is cancelled for that reason", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: subscription("active"),
				subscriptionBackdateStartMs: 1_790_000_000_000,
			}),
		).toEqual({
			type: "cancel",
			stripeSubscriptionId: "sub_active",
			reason: "backdate",
		});
	});

	test("a scheduled subscription replaced for a backdate is cancelled outright, its schedule with it", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: {
					...subscription("active"),
					schedule: "sub_sched_live",
				} as Stripe.Subscription,
				subscriptionBackdateStartMs: 1_790_000_000_000,
			}),
		).toEqual({
			type: "cancel",
			stripeSubscriptionId: "sub_active",
			reason: "backdate",
		});
	});

	test("a scheduled subscription a future start replaces keeps its plain cancel", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: {
					...subscription("active"),
					schedule: "sub_sched_live",
				} as Stripe.Subscription,
			}),
		).toEqual({ type: "cancel", stripeSubscriptionId: "sub_active" });
	});

	test("an unusable subscription keeps its plain cancel when backdating", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: subscription("unpaid"),
				subscriptionBackdateStartMs: 1_790_000_000_000,
			}),
		).toEqual({ type: "cancel", stripeSubscriptionId: "sub_unpaid" });
	});

	test("a terminal subscription needs no cancel", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: subscription("incomplete_expired"),
			}),
		).toBeUndefined();
	});

	test("no replaced subscription, no action", () => {
		expect(
			buildReplacedSubscriptionAction({
				replacedStripeSubscription: undefined,
			}),
		).toBeUndefined();
	});
});
