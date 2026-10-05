/** A backdated first phase recreates a healthy live subscription and its schedule; a start now, a later start, or a re-save of the live start keeps it. */

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

const planStart = currentEpochMs - ms.days(20);

const subscriptionWithStatus = (status: Stripe.Subscription.Status) =>
	({ id: "sub_live", status }) as Stripe.Subscription;

const liveSchedule = {
	id: "sub_sched_live",
	subscription: "sub_live",
} as Stripe.SubscriptionSchedule;

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
		startsAt: planStart,
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
	const backdatedStart = planStart;
	const earlierThanPlans = planStart - ms.days(30);

	test("a backdated start moves a healthy subscription aside to be recreated", () => {
		const pastDue = subscriptionWithStatus("past_due");

		expect(
			replace({ startsAt: earlierThanPlans, stripeSubscription: pastDue }),
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
				stripeSubscriptionSchedule: liveSchedule,
			}),
		).toEqual({});
		expect(
			replace({
				startsAt: backdatedStart,
				rows: [proOnLiveSubscription({ scheduledIds: ["sub_sched_live"] })],
			}),
		).toEqual({});
	});

	test("a re-saved plain subscription replays its plans' start rather than backdating", () => {
		expect(replace({ startsAt: backdatedStart })).toEqual({});
	});

	test("a past start that moves a plain subscription's plans earlier or later moves it aside", () => {
		const active = subscriptionWithStatus("active");

		for (const startsAt of [
			backdatedStart - ms.days(10),
			backdatedStart + ms.days(10),
		]) {
			expect(replace({ startsAt, stripeSubscription: active })).toEqual({
				stripeSubscription: undefined,
				stripeSubscriptionSchedule: undefined,
				replacedStripeSubscription: active,
			});
		}
	});

	test("a start earlier than a scheduled subscription's plans moves it and its schedule aside", () => {
		const active = subscriptionWithStatus("active");

		expect(
			replace({
				startsAt: earlierThanPlans,
				stripeSubscription: active,
				stripeSubscriptionSchedule: liveSchedule,
			}),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: active,
		});
		expect(
			replace({
				startsAt: earlierThanPlans,
				stripeSubscription: active,
				rows: [proOnLiveSubscription({ scheduledIds: ["sub_sched_live"] })],
			}),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: active,
		});
	});

	test("nothing live leaves nothing to replace", () => {
		expect(
			replace({ startsAt: backdatedStart, stripeSubscription: null }),
		).toEqual({});
	});
});
