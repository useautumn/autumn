/**
 * executeStripeSubscriptionOperation merges subscription_params on update
 * and cancel. Reserved keys stay Autumn-owned.
 *
 * Contract:
 *   New behaviors:
 *     update: user extras reach subscriptions.update; items/expand do not
 *     cancel: user extras reach subscriptions.cancel; expand stays Autumn's
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

const mockState = {
	updateCalls: [] as Stripe.SubscriptionUpdateParams[],
	cancelCalls: [] as Stripe.SubscriptionCancelParams[],
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			update: async (
				_subscriptionId: string,
				params: Stripe.SubscriptionUpdateParams,
			) => {
				mockState.updateCalls.push(params);
				return { id: "sub_updated" };
			},
			cancel: async (
				_subscriptionId: string,
				params: Stripe.SubscriptionCancelParams,
			) => {
				mockState.cancelCalls.push(params);
				return { id: "sub_canceled" };
			},
		},
	}),
}));

const { executeStripeSubscriptionOperation } = await import(
	"@/internal/billing/v2/providers/stripe/utils/subscriptions/executeStripeSubscriptionOperation"
);

const ctx = {
	org: { id: "org_123", config: { automatic_tax: false } },
	env: "sandbox",
} as unknown as AutumnContext;

const subscriptionParams = {
	cancellation_details: {
		feedback: "too_expensive" as const,
		comment: "Switching to a competitor",
	},
	items: [{ id: "si_user", quantity: 99 }],
	expand: ["customer"],
};

const billingContext = {
	stripeCustomer: { id: "cus_123" },
	stripeSubscription: {
		id: "sub_123",
		billing_mode: { type: "flexible" },
	},
	subscriptionParams,
} as unknown as BillingContext;

describe(
	chalk.yellowBright("executeStripeSubscriptionOperation subscription_params"),
	() => {
		beforeEach(() => {
			mockState.updateCalls = [];
			mockState.cancelCalls = [];
		});

		afterAll(() => {
			mock.restore();
		});

		test("forwards extras on update and keeps reserved keys", async () => {
			const subscriptionAction: StripeSubscriptionAction = {
				type: "update",
				stripeSubscriptionId: "sub_123",
				params: { items: [{ id: "si_autumn", quantity: 2 }] },
			};

			await executeStripeSubscriptionOperation({
				ctx,
				billingContext,
				subscriptionAction,
			});

			expect(mockState.updateCalls).toHaveLength(1);
			expect(mockState.updateCalls[0]?.cancellation_details).toEqual(
				subscriptionParams.cancellation_details,
			);
			expect(mockState.updateCalls[0]?.items).toEqual([
				{ id: "si_autumn", quantity: 2 },
			]);
			expect(mockState.updateCalls[0]?.expand).toEqual(["latest_invoice"]);
		});

		test("forwards extras on cancel and keeps expand", async () => {
			const subscriptionAction: StripeSubscriptionAction = {
				type: "cancel",
				stripeSubscriptionId: "sub_123",
			};

			await executeStripeSubscriptionOperation({
				ctx,
				billingContext,
				subscriptionAction,
			});

			expect(mockState.cancelCalls).toHaveLength(1);
			expect(mockState.cancelCalls[0]?.cancellation_details).toEqual(
				subscriptionParams.cancellation_details,
			);
			expect(mockState.cancelCalls[0]?.expand).toEqual(["latest_invoice"]);
		});
	},
);
