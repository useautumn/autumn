/**
 * A deferred plan's snapshot is only rebuilt when the customer or subscription changed under it;
 * otherwise it is replayed exactly as it was computed.
 */

import { expect, test } from "bun:test";
import {
	type BillingPlan,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isDeferredSnapshotStale } from "@/internal/billing/v2/execute/isDeferredSnapshotStale";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct.js";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer.js";

const pro = makeFullCusProduct({ id: "cp_pro", planId: "pro" });

const makeBillingPlan = ({
	expiring,
	subscriptionItemIds,
}: {
	expiring: FullCusProduct;
	subscriptionItemIds: string[];
}) =>
	({
		autumn: {
			insertCustomerProducts: [],
			updateCustomerProduct: {
				customerProduct: expiring,
				updates: { status: CusProductStatus.Expired },
			},
		},
		stripe: {
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: "sub_1",
				params: {
					items: [
						...subscriptionItemIds.map((id) => ({ id, deleted: true })),
						{ price: "price_new" },
					],
				},
			},
		},
	}) as unknown as BillingPlan;

const makeSubscription = (itemIds: string[]) =>
	({
		id: "sub_1",
		items: {
			data: itemIds.map((id) => ({ id, price: { id: `price_${id}` } })),
		},
	}) as unknown as Stripe.Subscription;

test("an untouched customer and subscription keep the snapshot", () => {
	expect(
		isDeferredSnapshotStale({
			billingPlan: makeBillingPlan({
				expiring: pro,
				subscriptionItemIds: ["si_pro"],
			}),
			fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			stripeSubscription: makeSubscription(["si_pro"]),
		}),
	).toBe(false);
});

test("a plan row replaced since the snapshot makes it stale", () => {
	const newPro = makeFullCusProduct({ id: "cp_pro_new", planId: "pro" });

	expect(
		isDeferredSnapshotStale({
			billingPlan: makeBillingPlan({
				expiring: pro,
				subscriptionItemIds: ["si_pro"],
			}),
			fullCustomer: makeFullCustomer({ customerProducts: [newPro] }),
			stripeSubscription: makeSubscription(["si_pro"]),
		}),
	).toBe(true);
});

test("a subscription item removed since the snapshot makes it stale", () => {
	expect(
		isDeferredSnapshotStale({
			billingPlan: makeBillingPlan({
				expiring: pro,
				subscriptionItemIds: ["si_pro"],
			}),
			fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			stripeSubscription: makeSubscription(["si_premium"]),
		}),
	).toBe(true);
});

test("a price the subscription already carries makes it stale", () => {
	const addPriceAlreadyOnSub = {
		autumn: { insertCustomerProducts: [] },
		stripe: {
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: "sub_1",
				params: { items: [{ price: "price_addon" }] },
			},
		},
	} as unknown as BillingPlan;
	const subscription = {
		id: "sub_1",
		items: { data: [{ id: "si_addon", price: { id: "price_addon" } }] },
	} as unknown as Stripe.Subscription;

	expect(
		isDeferredSnapshotStale({
			billingPlan: addPriceAlreadyOnSub,
			fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			stripeSubscription: subscription,
		}),
	).toBe(true);
});

const makeSchedulePlan = (
	subscriptionScheduleAction: Record<string, unknown>,
) =>
	({
		autumn: { insertCustomerProducts: [] },
		stripe: { subscriptionScheduleAction },
	}) as unknown as BillingPlan;

const makeSchedule = (id: string) =>
	({ id }) as unknown as Stripe.SubscriptionSchedule;

test("a schedule action on the live schedule keeps the snapshot", () => {
	expect(
		isDeferredSnapshotStale({
			billingPlan: makeSchedulePlan({
				type: "update",
				stripeSubscriptionScheduleId: "sub_sched_1",
				params: {},
			}),
			fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			stripeSubscriptionSchedule: makeSchedule("sub_sched_1"),
		}),
	).toBe(false);
});

test("a schedule replaced since the snapshot makes it stale", () => {
	expect(
		isDeferredSnapshotStale({
			billingPlan: makeSchedulePlan({
				type: "release",
				stripeSubscriptionScheduleId: "sub_sched_old",
			}),
			fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			stripeSubscriptionSchedule: makeSchedule("sub_sched_new"),
		}),
	).toBe(true);
});

test("creating a schedule when one now exists makes it stale", () => {
	expect(
		isDeferredSnapshotStale({
			billingPlan: makeSchedulePlan({ type: "create", params: {} }),
			fullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			stripeSubscriptionSchedule: makeSchedule("sub_sched_new"),
		}),
	).toBe(true);
});
