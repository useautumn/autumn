/** A backdated first phase recreates a healthy live subscription; a start now, a later start, or a re-saved schedule keeps it. */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type MultiAttachBillingContext,
	ms,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { products } from "@tests/utils/fixtures/db/products";
import type Stripe from "stripe";
import { replaceLiveSubscriptionForBackdate } from "@/internal/billing/v2/actions/setPlans/setup/replaceLiveSubscriptionForBackdate";

const currentEpochMs = 1_800_000_000_000;

const subscriptionWithStatus = (status: Stripe.Subscription.Status) =>
	({ id: "sub_live", status }) as Stripe.Subscription;

const proOnLiveSubscription = ({
	scheduledIds = [],
}: {
	scheduledIds?: string[];
} = {}): FullCusProduct => ({
	...customerProducts.create({
		id: "cus_prod_pro",
		productId: "pro",
		product: products.createFull({ id: "pro" }),
		status: CusProductStatus.Active,
		subscriptionIds: ["sub_live"],
	}),
	scheduled_ids: scheduledIds,
});

const replace = ({
	startsAt,
	stripeSubscription = subscriptionWithStatus("active"),
	stripeSubscriptionSchedule,
	rows = [proOnLiveSubscription()],
}: {
	startsAt: number;
	stripeSubscription?: Stripe.Subscription | null;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	rows?: FullCusProduct[];
}) =>
	replaceLiveSubscriptionForBackdate({
		billingContext: {
			currentEpochMs,
			stripeSubscription: stripeSubscription ?? undefined,
			stripeSubscriptionSchedule,
			fullCustomer: { customer_products: rows },
		} as unknown as MultiAttachBillingContext,
		immediatePhase: { starts_at: startsAt },
	});

describe("replaceLiveSubscriptionForBackdate", () => {
	const backdatedStart = currentEpochMs - ms.days(20);

	test("a backdated start moves a healthy subscription aside to be recreated", () => {
		const pastDue = subscriptionWithStatus("past_due");

		expect(
			replace({ startsAt: backdatedStart, stripeSubscription: pastDue }),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: pastDue,
		});
	});

	test("a start now or later keeps the live subscription", () => {
		expect(replace({ startsAt: currentEpochMs })).toEqual({});
		expect(replace({ startsAt: currentEpochMs + ms.days(7) })).toEqual({});
	});

	test("a re-saved schedule replays its started phase's date rather than backdating", () => {
		expect(
			replace({
				startsAt: backdatedStart,
				stripeSubscriptionSchedule: {
					id: "sub_sched_live",
					subscription: "sub_live",
				} as Stripe.SubscriptionSchedule,
			}),
		).toEqual({});
		expect(
			replace({
				startsAt: backdatedStart,
				rows: [proOnLiveSubscription({ scheduledIds: ["sub_sched_live"] })],
			}),
		).toEqual({});
	});

	test("nothing live leaves nothing to replace", () => {
		expect(
			replace({ startsAt: backdatedStart, stripeSubscription: null }),
		).toEqual({});
	});
});
