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
