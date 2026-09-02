/**
 * A pause/resume evaluates to one collection-only Stripe call.
 *
 * Contract:
 *   pause: pause_collection.behavior = "void", resumes_at from pause_until
 *   resume: pause_collection = null
 *   never: an `items` diff (a paused plan leaving the active set would read as
 *          "delete every item", i.e. cancel the subscription)
 */

import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import { buildStripeSubscriptionPauseAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionPauseAction";

const stripeSubscription = {
	id: "sub_123",
	items: { data: [{ id: "si_1" }] },
} as unknown as Stripe.Subscription;

const buildContext = (
	overrides: Partial<BillingContext> = {},
): BillingContext =>
	({
		stripeSubscription,
		...overrides,
	}) as BillingContext;

const PAUSE_UNTIL_MS = 1_800_000_000_000;

describe("buildStripeSubscriptionPauseAction", () => {
	test("pauses collection without touching items", () => {
		const action = buildStripeSubscriptionPauseAction({
			billingContext: buildContext({ pauseAction: "pause" }),
		});

		expect(action).toEqual({
			type: "update",
			stripeSubscriptionId: "sub_123",
			params: {
				pause_collection: { behavior: "void" },
				proration_behavior: "none",
			},
		});
	});

	test("hands the restart to Stripe when pause_until is set", () => {
		const action = buildStripeSubscriptionPauseAction({
			billingContext: buildContext({
				pauseAction: "pause",
				pauseUntilMs: PAUSE_UNTIL_MS,
			}),
		});

		expect(action?.type).toBe("update");
		expect(
			action?.type === "update" ? action.params.pause_collection : undefined,
		).toEqual({
			behavior: "void",
			resumes_at: PAUSE_UNTIL_MS / 1000,
		});
	});

	test("clears pause_collection on resume", () => {
		const action = buildStripeSubscriptionPauseAction({
			billingContext: buildContext({ pauseAction: "resume" }),
		});

		expect(
			action?.type === "update" ? action.params.pause_collection : undefined,
		).toBeNull();
	});

	test("Autumn's pause_collection wins over user subscription_params", () => {
		const action = buildStripeSubscriptionPauseAction({
			billingContext: buildContext({
				pauseAction: "pause",
				subscriptionParams: {
					pause_collection: { behavior: "keep_as_draft" },
					description: "user description",
				},
			}),
		});

		const params = action?.type === "update" ? action.params : undefined;

		expect(params?.pause_collection).toEqual({ behavior: "void" });
		expect(params?.description).toBe("user description");
		expect(params?.items).toBeUndefined();
	});

	test("no subscription means no Stripe call", () => {
		const action = buildStripeSubscriptionPauseAction({
			billingContext: buildContext({
				pauseAction: "pause",
				stripeSubscription: undefined,
			}),
		});

		expect(action).toBeUndefined();
	});
});
