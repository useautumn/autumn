import { describe, expect, test } from "bun:test";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { isUninvoicedBillingCycleAnchorMove } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/isUninvoicedBillingCycleAnchorMove";

const ANCHOR_A = 1_792_178_243;
const ANCHOR_B = 1_794_856_643;

const subscriptionAt = (billingCycleAnchor: number) =>
	({ billing_cycle_anchor: billingCycleAnchor }) as ExpandedStripeSubscription;

describe("isUninvoicedBillingCycleAnchorMove", () => {
	test("an anchor move without an invoice, on the current anchor, is consumed", () => {
		expect(
			isUninvoicedBillingCycleAnchorMove({
				subscriptionUpdatedContext: {
					previousAttributes: { billing_cycle_anchor: 1_791_314_240 },
					eventBillingCycleAnchor: ANCHOR_A,
					stripeSubscription: subscriptionAt(ANCHOR_A),
				},
			}),
		).toBe(true);
	});

	test("a move that raised an invoice is left to invoice.created", () => {
		expect(
			isUninvoicedBillingCycleAnchorMove({
				subscriptionUpdatedContext: {
					previousAttributes: {
						billing_cycle_anchor: 1_791_314_240,
						latest_invoice: "in_previous",
					},
					eventBillingCycleAnchor: ANCHOR_A,
					stripeSubscription: subscriptionAt(ANCHOR_A),
				},
			}),
		).toBe(false);
	});

	test("a stale event for an earlier anchor never consumes a later anchor's reset", () => {
		expect(
			isUninvoicedBillingCycleAnchorMove({
				subscriptionUpdatedContext: {
					previousAttributes: { billing_cycle_anchor: 1_791_314_240 },
					eventBillingCycleAnchor: ANCHOR_A,
					stripeSubscription: subscriptionAt(ANCHOR_B),
				},
			}),
		).toBe(false);
	});

	test("an update that didn't move the anchor is ignored", () => {
		expect(
			isUninvoicedBillingCycleAnchorMove({
				subscriptionUpdatedContext: {
					previousAttributes: { status: "active" },
					eventBillingCycleAnchor: ANCHOR_A,
					stripeSubscription: subscriptionAt(ANCHOR_A),
				},
			}),
		).toBe(false);
	});
});
