/** set_plans moves a terminal or unusable subscription and its schedule to `replacedStripeSubscription`, so a new one is created in its place. */

import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { splitReplacedStripeSubscription } from "@/internal/billing/v2/actions/setPlans/setup/splitReplacedStripeSubscription";

const subscription = ({
	id,
	status,
}: {
	id: string;
	status: Stripe.Subscription.Status;
}) => ({ id, status }) as Stripe.Subscription;

const schedule = ({ subscriptionId }: { subscriptionId: string | null }) =>
	({
		id: "sub_sched_1",
		subscription: subscriptionId,
	}) as Stripe.SubscriptionSchedule;

describe("splitReplacedStripeSubscription", () => {
	test("an active subscription and its schedule are kept", () => {
		const active = subscription({ id: "sub_active", status: "active" });
		const activeSchedule = schedule({ subscriptionId: "sub_active" });

		expect(
			splitReplacedStripeSubscription({
				stripeSubscription: active,
				stripeSubscriptionSchedule: activeSchedule,
			}),
		).toEqual({
			stripeSubscription: active,
			stripeSubscriptionSchedule: activeSchedule,
			replacedStripeSubscription: undefined,
		});
	});

	test("a paused subscription is replaced and its schedule dropped", () => {
		const paused = subscription({ id: "sub_paused", status: "paused" });

		expect(
			splitReplacedStripeSubscription({
				stripeSubscription: paused,
				stripeSubscriptionSchedule: schedule({ subscriptionId: "sub_paused" }),
			}),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: paused,
		});
	});

	test("an unpaid subscription is replaced", () => {
		const unpaid = subscription({ id: "sub_unpaid", status: "unpaid" });

		expect(
			splitReplacedStripeSubscription({ stripeSubscription: unpaid }),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: unpaid,
		});
	});

	test("a canceled subscription is replaced; a standalone future schedule is kept", () => {
		const canceled = subscription({ id: "sub_canceled", status: "canceled" });
		const standaloneSchedule = schedule({ subscriptionId: null });

		expect(
			splitReplacedStripeSubscription({
				canceledStripeSubscription: canceled,
				stripeSubscriptionSchedule: standaloneSchedule,
			}),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: standaloneSchedule,
			replacedStripeSubscription: canceled,
		});
	});

	test("an incomplete subscription behind pending plans is replaced", () => {
		const incomplete = subscription({
			id: "sub_incomplete",
			status: "incomplete",
		});

		expect(
			splitReplacedStripeSubscription({
				pendingStripeSubscription: incomplete,
			}),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: incomplete,
		});
	});

	test("a pending plan's subscription that is still collectable is left alone", () => {
		const active = subscription({ id: "sub_invoice_mode", status: "active" });

		expect(
			splitReplacedStripeSubscription({ pendingStripeSubscription: active }),
		).toEqual({
			stripeSubscription: undefined,
			stripeSubscriptionSchedule: undefined,
			replacedStripeSubscription: undefined,
		});
	});
});
