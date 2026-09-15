import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	createCalls: [] as unknown[],
	releaseCalls: [] as unknown[],
	updateCalls: [] as unknown[],
	failingUpdateCount: 0,
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
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
										discounts: [],
									},
								],
								discounts: [],
								add_invoice_items: [],
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
				if (mockState.failingUpdateCount > 0) {
					mockState.failingUpdateCount -= 1;
					throw new Error(
						"You can not update a phase that has already ended. Trying to update phase 0.",
					);
				}
				return { id: scheduleId, ...params };
			},
		},
	}),
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/logSubscriptionScheduleAction",
	() => ({
		logSubscriptionScheduleAction: () => undefined,
	}),
);

import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

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
		mockState.failingUpdateCount = 0;
	});

	const stripePhase = (
		phase: Omit<Partial<Stripe.SubscriptionSchedule.Phase>, "items"> & {
			items: { price: string; quantity?: number }[];
		},
	) =>
		({
			discounts: [],
			add_invoice_items: [],
			...phase,
			items: phase.items.map((item) => ({ ...item, discounts: [] })),
		}) as unknown as Stripe.SubscriptionSchedule.Phase;

	const previousSchedule = {
		id: "sched_previous",
		subscription: "sub_123",
		end_behavior: "release",
		phases: [
			stripePhase({
				start_date: 900,
				end_date: 2000,
				items: [{ price: "price_pro", quantity: 1 }],
			}),
			stripePhase({
				start_date: 2000,
				end_date: 3000,
				items: [{ price: "price_metered" }],
			}),
		],
	} as unknown as Stripe.SubscriptionSchedule;

	const updateAction = {
		type: "update" as const,
		stripeSubscriptionScheduleId: "sched_previous",
		params: {
			phases: [
				{ start_date: 1000, end_date: 2000, items: [{ price: "price_pro" }] },
				{ start_date: 2000, items: [{ price: "price_other" }] },
			],
			end_behavior: "release" as const,
		},
	};

	test("restores the previous phases when the recreate's phase update fails", async () => {
		mockState.failingUpdateCount = 1;

		await expect(
			executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext: {
					stripeSubscriptionSchedule: previousSchedule,
				} as unknown as BillingContext,
				subscriptionScheduleAction: updateAction,
			}),
		).rejects.toThrow("already ended");

		expect(mockState.releaseCalls).toEqual(["sched_previous"]);
		expect(mockState.updateCalls).toHaveLength(2);

		const restore = mockState.updateCalls[1] as {
			scheduleId: string;
			params: Stripe.SubscriptionScheduleUpdateParams;
		};
		expect(restore.scheduleId).toBe("sched_created");
		expect(restore.params.end_behavior).toBe("release");
		expect(restore.params.phases?.[0]?.start_date).toBe(1000);
		expect(restore.params.phases?.[1]).toMatchObject({
			start_date: 2000,
			end_date: 3000,
			items: [{ price: "price_metered" }],
		});
	});

	test("restores from the previous schedule's current phase, not its first", async () => {
		mockState.failingUpdateCount = 1;
		const advancedSchedule = {
			...previousSchedule,
			current_phase: { start_date: 2000, end_date: 3000 },
			phases: [
				...previousSchedule.phases,
				stripePhase({ start_date: 3000, items: [{ price: "price_last" }] }),
			],
		} as unknown as Stripe.SubscriptionSchedule;

		await expect(
			executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext: {
					stripeSubscriptionSchedule: advancedSchedule,
				} as unknown as BillingContext,
				subscriptionScheduleAction: updateAction,
			}),
		).rejects.toThrow("already ended");

		const restore = mockState.updateCalls[1] as {
			params: Stripe.SubscriptionScheduleUpdateParams;
		};
		expect(restore.params.phases).toHaveLength(2);
		expect(restore.params.phases?.[0]).toMatchObject({
			start_date: 1000,
			end_date: 3000,
		});
		expect(restore.params.phases?.[1]).toMatchObject({
			start_date: 3000,
			items: [{ price: "price_last" }],
		});
	});

	test("restore carries trials, discounts, invoice items, anchors and item metadata", async () => {
		mockState.failingUpdateCount = 1;
		const richSchedule = {
			...previousSchedule,
			current_phase: { start_date: 900, end_date: 2000 },
			phases: [
				previousSchedule.phases[0],
				{
					...stripePhase({
						start_date: 2000,
						end_date: 3000,
						items: [{ price: "price_entity_seat", quantity: 3 }],
					}),
					trial_end: 2500,
					billing_cycle_anchor: "phase_start",
					proration_behavior: "none",
					discounts: [
						{
							coupon: { id: "coupon_10off" },
							discount: null,
							promotion_code: null,
						},
					],
					add_invoice_items: [
						{ price: { id: "price_setup_fee" }, quantity: 1, discounts: [] },
					],
					items: [
						{
							price: "price_entity_seat",
							quantity: 3,
							discounts: [],
							metadata: { autumn_customer_price_id: "cus_price_seat" },
						},
					],
				},
			],
		} as unknown as Stripe.SubscriptionSchedule;

		await expect(
			executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext: {
					stripeSubscriptionSchedule: richSchedule,
				} as unknown as BillingContext,
				subscriptionScheduleAction: updateAction,
			}),
		).rejects.toThrow("already ended");

		const restore = mockState.updateCalls[1] as {
			params: Stripe.SubscriptionScheduleUpdateParams;
		};
		expect(restore.params.phases?.[1]).toEqual({
			start_date: 2000,
			end_date: 3000,
			trial_end: 2500,
			billing_cycle_anchor: "phase_start",
			proration_behavior: "none",
			discounts: [{ coupon: "coupon_10off" }],
			add_invoice_items: [{ price: "price_setup_fee", quantity: 1 }],
			items: [
				{
					price: "price_entity_seat",
					quantity: 3,
					metadata: { autumn_customer_price_id: "cus_price_seat" },
				},
			],
		});
	});

	test("releases the bare schedule when the previous phases cannot be restored", async () => {
		mockState.failingUpdateCount = 2;

		await expect(
			executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext: {
					stripeSubscriptionSchedule: previousSchedule,
				} as unknown as BillingContext,
				subscriptionScheduleAction: updateAction,
			}),
		).rejects.toThrow("already ended");

		expect(mockState.releaseCalls).toEqual(["sched_previous", "sched_created"]);
		expect(mockState.updateCalls).toHaveLength(2);
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
				params: {
					...params,
					metadata: {
						autumn_managed_at: expect.any(String),
					},
				},
			},
		]);

		const updateParams = mockState.updateCalls[0] as {
			params: {
				metadata: {
					autumn_managed_at: string;
				};
			};
		};
		expect(Number(updateParams.params.metadata.autumn_managed_at)).toBeFinite();
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
});

afterAll(() => {
	mock.restore();
});
