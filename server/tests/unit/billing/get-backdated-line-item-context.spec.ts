/** A new backdated subscription bills its catch-up periods; one recreated over a paid-up live subscription never does. */

import { describe, expect, test } from "bun:test";
import {
	applyBackdatedLineItemAmount,
	applyProration,
	type BillingContext,
	type LineItemContext,
	ms,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import type Stripe from "stripe";
import { getBackdateGapLineItemContext } from "@/internal/billing/v2/utils/backdate/getBackdateGapLineItemContext";
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

describe("getBackdateGapLineItemContext", () => {
	const MONTHLY_AMOUNT = 100;
	const gap = {
		start: Date.UTC(2026, 0, 31),
		end: Date.UTC(2026, 2, 30),
	};

	test("counts a month-end gap's cycles back from its end, the anchor its billing period uses", () => {
		expect(
			getBackdateGapLineItemContext({
				price,
				billingContext: { requestedProrationBehavior: "bill_difference" },
				backdateGapRun: { gap, run: gap },
			}),
		).toEqual({
			billingPeriod: { start: Date.UTC(2026, 0, 30), end: gap.end },
			now: Date.UTC(2026, 0, 30),
			effectivePeriod: gap,
			backdate: { startsAt: gap.start, cycleCount: 2 },
		});
	});

	test("a run cut short by a phase end is prorated over the gap's own cycle, not one anchored on the phase end", () => {
		const run = { start: gap.start, end: Date.UTC(2026, 1, 10) };
		const gapRunContext = getBackdateGapLineItemContext({
			price,
			billingContext: { requestedProrationBehavior: "prorate_immediately" },
			backdateGapRun: { gap, run },
		});
		const proratedAmount = applyProration({
			now: gapRunContext.now,
			billingPeriod: gapRunContext.billingPeriod,
			amount: MONTHLY_AMOUNT,
		});
		const context = {
			...gapRunContext,
			direction: "charge",
			billingTiming: "in_advance",
		} as LineItemContext;

		expect(gapRunContext.billingPeriod).toEqual({
			start: Date.UTC(2026, 0, 30),
			end: Date.UTC(2026, 1, 28),
		});
		expect(gapRunContext.effectivePeriod).toEqual(run);
		expect(
			applyBackdatedLineItemAmount({ amount: proratedAmount, context }),
		).toBeCloseTo((MONTHLY_AMOUNT * 10) / 29, 2);
	});
});
