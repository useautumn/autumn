import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
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
});

afterAll(() => {
	mock.restore();
});
