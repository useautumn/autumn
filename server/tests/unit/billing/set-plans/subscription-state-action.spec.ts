/** set_plans updates, replaces, or cancels and replaces the customer's Stripe subscription from its state alone. */

import { describe, expect, test } from "bun:test";
import {
	type SubscriptionState,
	subscriptionStateAction,
} from "@/internal/billing/v2/actions/setPlans/utils/subscriptionStateAction";

const EXPECTED_DECISIONS: [
	SubscriptionState,
	ReturnType<typeof subscriptionStateAction>,
][] = [
	["none", { action: "create", warning: null }],
	["active", { action: "update", warning: null }],
	["trialing", { action: "update", warning: null }],
	["past_due", { action: "update", warning: null }],
	["canceled", { action: "create", warning: "new_stripe_subscription" }],
	[
		"incomplete_expired",
		{ action: "create", warning: "new_stripe_subscription" },
	],
	[
		"incomplete",
		{ action: "cancel_and_create", warning: "subscription_replaced" },
	],
	["unpaid", { action: "cancel_and_create", warning: "subscription_replaced" }],
	["paused", { action: "cancel_and_create", warning: "subscription_replaced" }],
	[
		"checkout_session",
		{ action: "cancel_and_create", warning: "subscription_replaced" },
	],
];

describe("subscriptionStateAction", () => {
	for (const [state, expected] of EXPECTED_DECISIONS) {
		test(`${state} -> ${expected.action}`, () => {
			expect(subscriptionStateAction({ state })).toEqual(expected);
		});
	}
});
