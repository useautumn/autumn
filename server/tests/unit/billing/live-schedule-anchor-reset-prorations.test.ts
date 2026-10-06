/** A rebuild keeps the proration a pending anchor reset already carries on the live Stripe schedule. */

import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	CusProductStatus,
	type FullCusProduct,
	msToSeconds,
} from "@autumn/shared";
import type Stripe from "stripe";
import { liveScheduleAnchorResetProrations } from "@/internal/billing/v2/providers/stripe/setup/liveScheduleAnchorResetProrations";

const NOW = Date.UTC(2027, 2, 1, 12);
const ANCHOR = Date.UTC(2027, 2, 11, 12);
const PAST = Date.UTC(2027, 1, 1, 12);

const phase = ({
	startsAt,
	resetsCycle = true,
	prorationBehavior,
}: {
	startsAt: number;
	resetsCycle?: boolean;
	prorationBehavior: Stripe.SubscriptionSchedule.Phase.ProrationBehavior;
}) =>
	({
		start_date: msToSeconds(startsAt),
		billing_cycle_anchor: resetsCycle ? "phase_start" : null,
		proration_behavior: prorationBehavior,
	}) as Stripe.SubscriptionSchedule.Phase;

const billingContextFor = ({
	phases,
	customerProducts = [],
}: {
	phases: Stripe.SubscriptionSchedule.Phase[];
	customerProducts?: FullCusProduct[];
}) =>
	({
		currentEpochMs: NOW,
		stripeSubscription: { id: "sub_a" } as Stripe.Subscription,
		stripeSubscriptionSchedule: {
			id: "sched_a",
			phases,
		} as unknown as Stripe.SubscriptionSchedule,
		fullCustomer: { customer_products: customerProducts },
	}) as unknown as BillingContext;

describe("liveScheduleAnchorResetProrations", () => {
	test("a pending reset keeps none, and always_invoice reads as prorate_immediately", () => {
		expect(
			liveScheduleAnchorResetProrations({
				billingContext: billingContextFor({
					phases: [
						phase({
							startsAt: PAST,
							resetsCycle: false,
							prorationBehavior: "none",
						}),
						phase({ startsAt: ANCHOR, prorationBehavior: "none" }),
						phase({
							startsAt: ANCHOR + 1000,
							prorationBehavior: "always_invoice",
						}),
					],
				}),
			}),
		).toEqual([
			{ startsAt: ANCHOR, prorationBehavior: "none" },
			{ startsAt: ANCHOR + 1000, prorationBehavior: "prorate_immediately" },
		]);
	});

	test("Stripe's create_prorations default names nothing", () => {
		expect(
			liveScheduleAnchorResetProrations({
				billingContext: billingContextFor({
					phases: [
						phase({ startsAt: ANCHOR, prorationBehavior: "create_prorations" }),
					],
				}),
			}),
		).toEqual([]);
	});

	test("a reset where a scheduled plan starts is left to that plan change's own rule", () => {
		expect(
			liveScheduleAnchorResetProrations({
				billingContext: billingContextFor({
					phases: [phase({ startsAt: ANCHOR, prorationBehavior: "none" })],
					customerProducts: [
						{
							status: CusProductStatus.Scheduled,
							starts_at: ANCHOR,
							scheduled_ids: ["sched_a"],
						} as FullCusProduct,
					],
				}),
			}),
		).toEqual([]);
	});

	test("a plan scheduled on another subscription at the same time doesn't hide this reset", () => {
		expect(
			liveScheduleAnchorResetProrations({
				billingContext: billingContextFor({
					phases: [phase({ startsAt: ANCHOR, prorationBehavior: "none" })],
					customerProducts: [
						{
							status: CusProductStatus.Scheduled,
							starts_at: ANCHOR,
							subscription_ids: ["sub_b"],
							scheduled_ids: ["sched_b"],
						} as FullCusProduct,
					],
				}),
			}),
		).toEqual([{ startsAt: ANCHOR, prorationBehavior: "none" }]);
	});
});
