import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { stripeBillingPlanToProcessorChanges } from "@/internal/billing/v2/actions/setPlans/preview/stripeBillingPlanToProcessorChanges";

const subscriptionBackedSchedule = {
	id: "sub_sched_old",
	subscription: "sub_live",
} as Stripe.SubscriptionSchedule;
const standaloneSchedule = {
	id: "sub_sched_old",
	subscription: null,
} as Stripe.SubscriptionSchedule;
const twoPhases = { phases: [{ items: [] }, { items: [] }] };

describe("stripeBillingPlanToProcessorChanges", () => {
	test("new subscription with a new schedule", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionAction: { type: "create", params: {} },
					subscriptionScheduleAction: { type: "create", params: twoPhases },
				},
			}),
		).toEqual([
			{
				type: "subscription",
				processor: "stripe",
				id: null,
				action: "created",
			},
			{
				type: "subscription_schedule",
				processor: "stripe",
				id: null,
				action: "created",
				phase_count: 2,
			},
		]);
	});

	test("subscription-backed schedule update is a release and a recreate", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionAction: {
						type: "update",
						stripeSubscriptionId: "sub_live",
						params: {},
					},
					subscriptionScheduleAction: {
						type: "update",
						stripeSubscriptionScheduleId: "sub_sched_old",
						params: twoPhases,
					},
				},
				stripeSubscriptionSchedule: subscriptionBackedSchedule,
			}),
		).toEqual([
			{
				type: "subscription",
				processor: "stripe",
				id: "sub_live",
				action: "updated",
			},
			{
				type: "subscription_schedule",
				processor: "stripe",
				id: "sub_sched_old",
				action: "released",
			},
			{
				type: "subscription_schedule",
				processor: "stripe",
				id: null,
				action: "created",
				phase_count: 2,
			},
		]);
	});

	test("standalone schedule update stays in place", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionScheduleAction: {
						type: "update",
						stripeSubscriptionScheduleId: "sub_sched_old",
						params: twoPhases,
					},
				},
				stripeSubscriptionSchedule: standaloneSchedule,
			}),
		).toEqual([
			{
				type: "subscription_schedule",
				processor: "stripe",
				id: "sub_sched_old",
				action: "updated",
				phase_count: 2,
			},
		]);
	});

	test("cancel and release", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionAction: {
						type: "cancel",
						stripeSubscriptionId: "sub_live",
					},
					subscriptionScheduleAction: {
						type: "release",
						stripeSubscriptionScheduleId: "sub_sched_old",
					},
				},
			}),
		).toEqual([
			{
				type: "subscription",
				processor: "stripe",
				id: "sub_live",
				action: "canceled",
			},
			{
				type: "subscription_schedule",
				processor: "stripe",
				id: "sub_sched_old",
				action: "released",
			},
		]);
	});

	test("a subscription checkout creates the subscription", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					checkoutSessionAction: {
						type: "create",
						params: { mode: "subscription" },
					},
				},
			}),
		).toEqual([
			{
				type: "subscription",
				processor: "stripe",
				id: null,
				action: "created",
			},
		]);
	});

	test("no Stripe actions", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: { subscriptionAction: { type: "none" } },
			}),
		).toEqual([]);
	});
});
