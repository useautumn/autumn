import { expect, test } from "bun:test";
import { addDays, getUnixTime, subDays } from "date-fns";
import type Stripe from "stripe";
import { getTrialEndsAtFromStripe } from "@/internal/billing/v2/actions/sync/utils/initSyncFromStripe";

const now = new Date("2026-09-16T12:00:00.000Z");
const nowMs = now.getTime();

const subscription = (trialEnd: Date | null): Stripe.Subscription =>
	({
		trial_end: trialEnd ? getUnixTime(trialEnd) : null,
	}) as Stripe.Subscription;

test("ignores a Stripe trial that has already ended", () => {
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(subDays(now, 1)),
			nowMs,
		}),
	).toBeUndefined();
});

test("ignores a Stripe trial ending right now", () => {
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(now),
			nowMs,
		}),
	).toBeUndefined();
});

test("preserves a future Stripe trial end", () => {
	const trialEnd = addDays(now, 7);
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(trialEnd),
			nowMs,
		}),
	).toBe(trialEnd.getTime());
});

test("ignores a missing Stripe trial end", () => {
	expect(
		getTrialEndsAtFromStripe({
			stripeSubscription: subscription(null),
			nowMs,
		}),
	).toBeUndefined();
});
