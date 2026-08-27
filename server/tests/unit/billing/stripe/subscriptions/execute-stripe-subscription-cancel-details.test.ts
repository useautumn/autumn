import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

const mockState = {
	cancelCalls: [] as Array<{
		subscriptionId: string;
		params: Stripe.SubscriptionCancelParams;
	}>,
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			cancel: async (
				subscriptionId: string,
				params: Stripe.SubscriptionCancelParams,
			) => {
				mockState.cancelCalls.push({ subscriptionId, params });
				return { id: subscriptionId };
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

describe(
	chalk.yellowBright("executeStripeSubscriptionOperation cancel details"),
	() => {
		beforeEach(() => {
			mockState.cancelCalls = [];
		});

		afterAll(() => {
			mockState.cancelCalls = [];
		});

		test("forwards cancellation_details on subscriptions.cancel", async () => {
			const subscriptionAction: StripeSubscriptionAction = {
				type: "cancel",
				stripeSubscriptionId: "sub_123",
				params: {
					cancellation_details: {
						feedback: "too_expensive",
						comment: "Switching to a competitor",
					},
				},
			};

			await executeStripeSubscriptionOperation({
				ctx,
				billingContext: {
					stripeCustomer: { id: "cus_123" },
				} as unknown as BillingContext,
				subscriptionAction,
			});

			expect(mockState.cancelCalls).toHaveLength(1);
			expect(mockState.cancelCalls[0]?.subscriptionId).toBe("sub_123");
			expect(mockState.cancelCalls[0]?.params.cancellation_details).toEqual({
				feedback: "too_expensive",
				comment: "Switching to a competitor",
			});
		});
	},
);
