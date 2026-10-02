/** A new backdated subscription bills its catch-up periods; one recreated over a paid-up live subscription never does. */

import { describe, expect, test } from "bun:test";
import { type BillingContext, ms } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import type Stripe from "stripe";
import { getBackdatedLineItemContext } from "@/internal/billing/v2/utils/lineItems/getBackdatedLineItemContext";

const NOW = 1_800_000_000_000;
const BACKDATED_START = NOW - ms.days(40);
const price = prices.createFixed({ id: "price_pro" });

const catchUpContext = (
	overrides: Partial<BillingContext>,
): ReturnType<typeof getBackdatedLineItemContext> =>
	getBackdatedLineItemContext({
		price,
		billingContext: {
			currentEpochMs: NOW,
			subscriptionBackdateStartMs: BACKDATED_START,
			billingCycleAnchorMs: BACKDATED_START,
			...overrides,
		} as BillingContext,
		billingPeriod: { start: NOW - ms.days(10), end: NOW + ms.days(20) },
		direction: "charge",
		billingTiming: "in_advance",
	});

describe("getBackdatedLineItemContext", () => {
	test("a new backdated subscription charges from the backdated start", () => {
		expect(catchUpContext({})?.effectivePeriod?.start).toBe(BACKDATED_START);
	});

	test("a subscription recreated over a healthy live one adds no catch-up charge", () => {
		expect(
			catchUpContext({
				replacedStripeSubscription: {
					id: "sub_live",
					status: "active",
				} as Stripe.Subscription,
			}),
		).toBeUndefined();
	});
});
