import { expect, test } from "bun:test";
import type Stripe from "stripe";
import { getTrialEndsAtFromStripe } from "@/internal/billing/v2/actions/sync/utils/initSyncFromStripe";

const subscription = (trialEnd: number | null): Stripe.Subscription =>
	({ trial_end: trialEnd }) as Stripe.Subscription;

test("ignores a Stripe trial that has already ended", () => {
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(99),
			nowMs: 100_000,
		}),
	).toBeUndefined();
});

test("preserves a future Stripe trial end", () => {
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(101),
			nowMs: 100_000,
		}),
	).toBe(101_000);
});

test("ignores a missing Stripe trial end", () => {
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(null),
			nowMs: 100_000,
		}),
	).toBeUndefined();
});
