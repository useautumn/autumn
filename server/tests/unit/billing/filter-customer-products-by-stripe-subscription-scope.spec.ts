import { expect, test } from "bun:test";
import {
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionScope,
} from "@autumn/shared";

const PAID_PRICE = {
	price: { config: { type: "fixed", amount: 20, interval: "month" } },
};

const customerProduct = ({
	id,
	isPaid,
	subscriptionIds = [],
	scheduledIds = [],
}: {
	id: string;
	isPaid: boolean;
	subscriptionIds?: string[];
	scheduledIds?: string[];
}): FullCusProduct =>
	({
		id,
		subscription_ids: subscriptionIds,
		scheduled_ids: scheduledIds,
		customer_prices: isPaid ? [PAID_PRICE] : [],
		customer_licenses: [],
	}) as unknown as FullCusProduct;

const CUSTOMER_PRODUCTS = [
	customerProduct({ id: "on_sub", isPaid: true, subscriptionIds: ["sub_a"] }),
	customerProduct({
		id: "on_schedule",
		isPaid: true,
		scheduledIds: ["sub_sched_a"],
	}),
	customerProduct({ id: "free", isPaid: false }),
	customerProduct({ id: "unlinked_paid", isPaid: true }),
	customerProduct({
		id: "other_sub",
		isPaid: true,
		subscriptionIds: ["sub_b"],
	}),
	customerProduct({
		id: "free_on_other_sub",
		isPaid: false,
		subscriptionIds: ["sub_b"],
	}),
];

const scopedIds = (params: {
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
}) =>
	filterCustomerProductsByStripeSubscriptionScope({
		customerProducts: CUSTOMER_PRODUCTS,
		...params,
	}).map(({ id }) => id);

test("a subscription's scope is its plans, its schedule's plans and the unlinked free plans", () => {
	expect(
		scopedIds({
			stripeSubscriptionId: "sub_a",
			stripeScheduleId: "sub_sched_a",
		}),
	).toEqual(["on_sub", "on_schedule", "free"]);
});

test("a not-yet-started schedule's scope still carries the free plans", () => {
	expect(
		scopedIds({ stripeSubscriptionId: null, stripeScheduleId: "sub_sched_a" }),
	).toEqual(["on_schedule", "free"]);
});

test("another subscription's scope leaves this one's plans out", () => {
	expect(scopedIds({ stripeSubscriptionId: "sub_b" })).toEqual([
		"free",
		"other_sub",
		"free_on_other_sub",
	]);
});
