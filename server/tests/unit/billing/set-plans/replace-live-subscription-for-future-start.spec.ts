/** A future first phase cancels the live subscription once every plan on it ends now; anything left on it keeps it. */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullCusProduct,
	ms,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { products } from "@tests/utils/fixtures/db/products";
import type Stripe from "stripe";
import { replaceLiveSubscriptionForFutureStart } from "@/internal/billing/v2/actions/setPlans/setup/replaceLiveSubscriptionForFutureStart";
import type { TimelineOperation } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineDiff";

const currentEpochMs = 1_800_000_000_000;
const liveSubscription = {
	id: "sub_live",
	status: "active",
} as Stripe.Subscription;
const liveSchedule = {
	id: "sub_sched_live",
	subscription: liveSubscription.id,
} as Stripe.SubscriptionSchedule;

const rowOnLiveSubscription = (id: string) =>
	customerProducts.create({
		id,
		productId: id,
		product: products.createFull({ id }),
		status: CusProductStatus.Active,
		subscriptionIds: [liveSubscription.id],
	});

const expire = (customerProductId: string): TimelineOperation => ({
	type: "expire",
	key: customerProductId,
	customerProductId,
});

const replace = ({
	startsAt,
	rows,
	operations,
}: {
	startsAt: number;
	rows: FullCusProduct[];
	operations: TimelineOperation[];
}) =>
	replaceLiveSubscriptionForFutureStart({
		billingContext: {
			currentEpochMs,
			immediatePhase: { starts_at: startsAt, plans: [] },
			stripeSubscription: liveSubscription,
			stripeSubscriptionSchedule: liveSchedule,
			fullCustomer: { customer_products: rows },
		} as unknown as CreateScheduleBillingContext,
		operations,
	});

describe("replaceLiveSubscriptionForFutureStart", () => {
	const futureStart = currentEpochMs + ms.days(7);

	test("cancels the subscription when every plan on it ends now", () => {
		const pro = rowOnLiveSubscription("pro");

		expect(
			replace({
				startsAt: futureStart,
				rows: [pro],
				operations: [expire(pro.id)],
			}),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: liveSubscription,
		});
	});

	test("keeps the subscription while a plan the request leaves alone stays on it", () => {
		const pro = rowOnLiveSubscription("pro");
		const seats = rowOnLiveSubscription("seats");

		expect(
			replace({
				startsAt: futureStart,
				rows: [pro, seats],
				operations: [expire(pro.id)],
			}),
		).toEqual({});
	});

	test("leaves a first phase that starts now alone", () => {
		const pro = rowOnLiveSubscription("pro");

		expect(
			replace({
				startsAt: currentEpochMs,
				rows: [pro],
				operations: [expire(pro.id)],
			}),
		).toEqual({});
	});
});
