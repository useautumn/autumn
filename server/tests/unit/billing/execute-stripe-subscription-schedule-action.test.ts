import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	createCalls: [] as unknown[],
	releaseCalls: [] as unknown[],
	updateCalls: [] as unknown[],
	cusProductUpdates: [] as unknown[],
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

mock.module("@/internal/customers/cusProducts/CusProductService", () => ({
	CusProductService: {
		updateByStripeScheduledId: async (params: unknown) => {
			mockState.cusProductUpdates.push(params);
		},
	},
}));

import {
	executeStripeSubscriptionScheduleAction,
	restoreReleasedSubscriptionSchedule,
} from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";

const ctx = {
	db: {},
	org: { id: "org_123" },
	env: "sandbox",
	logger: {
		debug: mock(() => {}),
		info: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("executeStripeSubscriptionScheduleAction", () => {
	beforeEach(() => {
		mockState.createCalls = [];
		mockState.releaseCalls = [];
		mockState.updateCalls = [];
		mockState.cusProductUpdates = [];
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
			unit_amount_decimal: "1000",
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
							unit_amount_decimal: "1000",
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
			unit_amount_decimal: "1000",
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
							unit_amount_decimal: "1000",
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

	test("restoring a released schedule skips historical phases", async () => {
		await restoreReleasedSubscriptionSchedule({
			ctx,
			billingContext: {
				stripeSubscriptionSchedule: {
					id: "sched_released",
					subscription: "sub_123",
					current_phase: { start_date: 1000, end_date: 2000 },
					end_behavior: "release",
					phases: [
						{
							start_date: 500,
							end_date: 1000,
							items: [{ price: { id: "price_past" }, quantity: 1 }],
							proration_behavior: "none",
						},
						{
							start_date: 1000,
							end_date: 2000,
							add_invoice_items: [
								{
									price: { id: "price_phase_invoice_item" },
									quantity: 1,
									tax_rates: [{ id: "txr_invoice_item" }],
								},
							],
							application_fee_percent: 12.5,
							automatic_tax: { enabled: true, liability: { type: "self" } },
							default_tax_rates: [{ id: "txr_phase" }],
							invoice_settings: {
								account_tax_ids: [{ id: "txi_phase" }],
								days_until_due: 10,
								issuer: { type: "self" },
							},
							items: [{ price: { id: "price_current" }, quantity: 1 }],
							proration_behavior: "none",
							trial_end: 1500,
						},
						{
							start_date: 2000,
							end_date: 3000,
							items: [{ price: { id: "price_future" }, quantity: 1 }],
							proration_behavior: "none",
						},
					],
				},
			} as unknown as BillingContext,
		});

		const updateParams = mockState.updateCalls[0] as {
			params: Stripe.SubscriptionScheduleUpdateParams;
		};
		const phases = updateParams.params.phases ?? [];

		expect(phases).toHaveLength(2);
		expect(phases.some((phase) => phase.start_date === 500)).toBe(false);
		expect(phases[0]?.add_invoice_items?.[0]?.price).toBe(
			"price_phase_invoice_item",
		);
		expect(phases[0]?.add_invoice_items?.[0]?.tax_rates).toEqual([
			"txr_invoice_item",
		]);
		expect(phases[0]?.application_fee_percent).toBe(12.5);
		expect(phases[0]?.automatic_tax?.enabled).toBe(true);
		expect(phases[0]?.default_tax_rates).toEqual(["txr_phase"]);
		expect(phases[0]?.invoice_settings?.account_tax_ids).toEqual(["txi_phase"]);
		expect(phases[0]?.invoice_settings?.days_until_due).toBe(10);
		expect(phases[0]?.trial_end).toBe(1500);
		expect(mockState.cusProductUpdates).toHaveLength(1);
	});
});

afterAll(() => {
	mock.restore();
});
