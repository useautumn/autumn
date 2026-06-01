import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	createCalls: [] as unknown[],
	releaseCalls: [] as unknown[],
	updateCalls: [] as unknown[],
};

mock.module("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptionSchedules: {
			create: async (params: unknown) => {
				mockState.createCalls.push(params);
				if ((params as { from_subscription?: string }).from_subscription) {
					return {
						id: "sched_created",
						current_phase: { start_date: 1000, end_date: 2000 },
						phases: [
							{
								items: [
									{
										price: { id: "price_current_inline" },
										quantity: 1,
									},
								],
							},
						],
					};
				}
				return { id: "sched_created" };
			},
			release: async (scheduleId: string) => {
				mockState.releaseCalls.push(scheduleId);
				return { id: scheduleId };
			},
			update: async (scheduleId: string, params: Record<string, unknown>) => {
				mockState.updateCalls.push({ scheduleId, params });
				return { id: scheduleId, ...params };
			},
		},
	}),
}));

mock.module(
	"@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/logSubscriptionScheduleAction",
	() => ({
		logSubscriptionScheduleAction: () => undefined,
	}),
);

import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";

const ctx = {
	org: { id: "org_123" },
	env: "sandbox",
	logger: {
		debug: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("executeStripeSubscriptionScheduleAction", () => {
	beforeEach(() => {
		mockState.createCalls = [];
		mockState.releaseCalls = [];
		mockState.updateCalls = [];
	});

	test("updates standalone future schedules without requiring a subscription id", async () => {
		const params = {
			phases: [
				{
					start_date: 1_800_000_000,
					items: [{ price: "price_123", quantity: 1 }],
				},
			],
			end_behavior: "release",
		} satisfies Stripe.SubscriptionScheduleUpdateParams;
		const billingContext = {
			stripeCustomer: { id: "cus_123" },
			stripeSubscriptionSchedule: {
				id: "sched_standalone",
				subscription: null,
			},
		} as unknown as BillingContext;

		const result = await executeStripeSubscriptionScheduleAction({
			ctx,
			billingContext,
			subscriptionScheduleAction: {
				type: "update",
				stripeSubscriptionScheduleId: "sched_standalone",
				params,
			},
		});

		expect(mockState.updateCalls).toEqual([
			{
				scheduleId: "sched_standalone",
				params,
			},
		]);
		expect(mockState.releaseCalls).toEqual([]);
		expect(mockState.createCalls).toEqual([]);
		expect(result?.id).toBe("sched_standalone");
	});

	test("reuses current inline price ids in future phases", async () => {
		const inlinePrice = {
			product: "stripe_prod_inline",
			currency: "usd",
			recurring: { interval: "month" as const, interval_count: 1 },
			unit_amount_decimal: Stripe.Decimal.from("1000"),
		};
		const params = {
			phases: [
				{
					start_date: 1000,
					items: [{ price_data: inlinePrice, quantity: 1 }],
				},
				{
					start_date: 2000,
					items: [
						{
							price_data: inlinePrice,
							quantity: 1,
							metadata: {
								autumn_customer_price_id: "cus_price_inline",
							},
						},
					],
				},
			],
			end_behavior: "release",
		} satisfies Stripe.SubscriptionScheduleUpdateParams;
		const stripeSubscription = {
			id: "sub_123",
			object: "subscription",
			items: {
				object: "list",
				data: [
					{
						id: "si_inline",
						metadata: {
							autumn_customer_price_id: "cus_price_inline",
						},
						price: {
							id: "price_current_inline",
							object: "price",
							product: "stripe_prod_inline",
							currency: "usd",
							recurring: { interval: "month", interval_count: 1 },
							unit_amount_decimal: Stripe.Decimal.from("1000"),
						},
					},
				],
			},
		} as unknown as Stripe.Subscription;
		const billingContext = {
			stripeCustomer: { id: "cus_123" },
		} as unknown as BillingContext;

		await executeStripeSubscriptionScheduleAction({
			ctx,
			billingContext,
			subscriptionScheduleAction: {
				type: "create",
				params,
			},
			stripeSubscription,
		});

		const updateParams = mockState.updateCalls[0] as {
			params: Stripe.SubscriptionScheduleUpdateParams;
		};
		const futureItem = updateParams.params.phases?.[1]?.items?.[0];

		expect(futureItem?.price).toBe("price_current_inline");
		expect(futureItem?.price_data).toBeUndefined();
		expect(futureItem?.metadata?.autumn_customer_price_id).toBe(
			"cus_price_inline",
		);
	});

	test("can reuse the same current inline price across separate future phases", async () => {
		const inlinePrice = {
			product: "stripe_prod_inline",
			currency: "usd",
			recurring: { interval: "month" as const, interval_count: 1 },
			unit_amount_decimal: Stripe.Decimal.from("1000"),
		};
		const params = {
			phases: [
				{
					start_date: 1000,
					items: [{ price_data: inlinePrice, quantity: 1 }],
				},
				{
					start_date: 2000,
					end_date: 3000,
					items: [
						{
							price_data: inlinePrice,
							quantity: 1,
							metadata: {
								autumn_customer_price_id: "cus_price_inline",
							},
						},
					],
				},
				{
					start_date: 3000,
					items: [
						{
							price_data: inlinePrice,
							quantity: 1,
							metadata: {
								autumn_customer_price_id: "cus_price_inline",
							},
						},
					],
				},
			],
			end_behavior: "release",
		} satisfies Stripe.SubscriptionScheduleUpdateParams;
		const stripeSubscription = {
			id: "sub_123",
			object: "subscription",
			items: {
				object: "list",
				data: [
					{
						id: "si_inline",
						metadata: {
							autumn_customer_price_id: "cus_price_inline",
						},
						price: {
							id: "price_current_inline",
							object: "price",
							product: "stripe_prod_inline",
							currency: "usd",
							recurring: { interval: "month", interval_count: 1 },
							unit_amount_decimal: Stripe.Decimal.from("1000"),
						},
					},
				],
			},
		} as unknown as Stripe.Subscription;

		await executeStripeSubscriptionScheduleAction({
			ctx,
			billingContext: { stripeCustomer: { id: "cus_123" } } as BillingContext,
			subscriptionScheduleAction: {
				type: "create",
				params,
			},
			stripeSubscription,
		});

		const updateParams = mockState.updateCalls[0] as {
			params: Stripe.SubscriptionScheduleUpdateParams;
		};

		expect(updateParams.params.phases?.[1]?.items?.[0]?.price).toBe(
			"price_current_inline",
		);
		expect(updateParams.params.phases?.[2]?.items?.[0]?.price).toBe(
			"price_current_inline",
		);
	});
});

afterAll(() => {
	mock.restore();
});
