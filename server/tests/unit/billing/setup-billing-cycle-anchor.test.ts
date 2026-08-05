import { describe, expect, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";

// Hound's real shape: subscription created 15 Apr 2026, anchored 18 Dec 2026,
// customer products recreated by `restore` on 30 Jul 2026.
const SUB_CREATED_S = 1776295638; // 2026-04-15T23:27:18Z
const STRIPE_ANCHOR_S = 1797612337; // 2026-12-18T16:45:37Z
const RESTORE_MS = 1785415913592; // 2026-07-30T12:51:53Z
const NOW_MS = Date.UTC(2026, 7, 1, 23, 40, 38);

const paidYearlyProduct = {
	prices: [{ config: { interval: "year", amount: 6600 } }],
} as unknown as FullProduct;

const existingSubscription = {
	created: SUB_CREATED_S,
	billing_cycle_anchor: STRIPE_ANCHOR_S,
	items: { data: [] },
} as unknown as Stripe.Subscription;

describe("setupBillingCycleAnchor", () => {
	test("keeps the subscription's anchor when a past starts_at arrives on an existing subscription", () => {
		expect(
			setupBillingCycleAnchor({
				stripeSubscription: existingSubscription,
				customerProduct: undefined,
				newFullProduct: paidYearlyProduct,
				currentEpochMs: NOW_MS,
				billingStartsAt: RESTORE_MS,
			}),
		).toBe(STRIPE_ANCHOR_S * 1000);
	});

	test("still anchors a brand-new backdated subscription to its past starts_at", () => {
		expect(
			setupBillingCycleAnchor({
				stripeSubscription: undefined,
				customerProduct: undefined,
				newFullProduct: paidYearlyProduct,
				currentEpochMs: NOW_MS,
				billingStartsAt: RESTORE_MS,
			}),
		).toBe(RESTORE_MS);
	});

	test("an explicit requested anchor still wins over an existing subscription", () => {
		expect(
			setupBillingCycleAnchor({
				stripeSubscription: existingSubscription,
				customerProduct: undefined,
				newFullProduct: paidYearlyProduct,
				currentEpochMs: NOW_MS,
				billingStartsAt: RESTORE_MS,
				requestedBillingCycleAnchor: "now",
			}),
		).toBe("now");
	});
});
