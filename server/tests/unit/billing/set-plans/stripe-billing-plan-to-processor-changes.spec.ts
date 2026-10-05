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
				id: null,
				action: "created",
			},
			{
				type: "subscription_schedule",
				id: null,
				action: "created",
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
				id: "sub_live",
				action: "updated",
			},
			{
				type: "subscription_schedule",
				id: "sub_sched_old",
				action: "released",
			},
			{
				type: "subscription_schedule",
				id: null,
				action: "created",
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
				id: "sub_sched_old",
				action: "updated",
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
				id: "sub_live",
				action: "canceled",
			},
			{
				type: "subscription_schedule",
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
				id: null,
				action: "created",
			},
		]);
	});

	test("a subscription a later start replaces shows its cancel before the new schedule", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionScheduleAction: { type: "create", params: twoPhases },
					replacedSubscriptionAction: {
						type: "cancel",
						stripeSubscriptionId: "sub_live",
					},
				},
			}),
		).toEqual([
			{ type: "subscription", id: "sub_live", action: "canceled" },
			{ type: "subscription_schedule", id: null, action: "created" },
		]);
	});

	test("a replaced subscription shows its cancel beside the new one's create", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionAction: { type: "create", params: {} },
					replacedSubscriptionAction: {
						type: "cancel",
						stripeSubscriptionId: "sub_live",
						reason: "backdate",
					},
				},
			}),
		).toEqual([
			{ type: "subscription", id: null, action: "created" },
			{ type: "subscription", id: "sub_live", action: "canceled" },
		]);
	});

	test("a scheduled subscription a backdate recreates shows its schedule released before its cancel", () => {
		expect(
			stripeBillingPlanToProcessorChanges({
				stripeBillingPlan: {
					subscriptionAction: { type: "create", params: {} },
					subscriptionScheduleAction: { type: "create", params: twoPhases },
					replacedSubscriptionAction: {
						type: "cancel",
						stripeSubscriptionId: "sub_live",
						stripeSubscriptionScheduleId: "sub_sched_old",
						reason: "backdate",
					},
				},
			}),
		).toEqual([
			{ type: "subscription", id: null, action: "created" },
			{
				type: "subscription_schedule",
				id: "sub_sched_old",
				action: "released",
			},
			{ type: "subscription", id: "sub_live", action: "canceled" },
			{ type: "subscription_schedule", id: null, action: "created" },
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
