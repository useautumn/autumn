/** Stripe rejects default_tax_rates alongside automatic_tax, so a created subscription's manual rate wins. */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

const mockState = {
	createCalls: [] as Stripe.SubscriptionCreateParams[],
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			create: async (params: Stripe.SubscriptionCreateParams) => {
				mockState.createCalls.push(params);
				return { id: "sub_created" };
			},
		},
	}),
}));

const { executeStripeSubscriptionOperation } = await import(
	"@/internal/billing/v2/providers/stripe/utils/subscriptions/executeStripeSubscriptionOperation"
);

const automaticTaxCtx = {
	org: { id: "org_123", config: { automatic_tax: true } },
	env: "sandbox",
} as unknown as AutumnContext;

const taxableCustomerContext = {
	stripeCustomer: { id: "cus_123", address: { country: "GB" } },
} as unknown as BillingContext;

const createAction = (
	params: Stripe.SubscriptionCreateParams,
): StripeSubscriptionAction => ({ type: "create", params });

describe("executeStripeSubscriptionOperation tax", () => {
	beforeEach(() => {
		mockState.createCalls = [];
	});

	afterAll(() => {
		mock.restore();
	});

	test("a created subscription with manual tax rates doesn't also enable automatic tax", async () => {
		await executeStripeSubscriptionOperation({
			ctx: automaticTaxCtx,
			billingContext: taxableCustomerContext,
			subscriptionAction: createAction({
				customer: "cus_123",
				default_tax_rates: ["txr_vat"],
			}),
		});

		expect(mockState.createCalls[0]?.default_tax_rates).toEqual(["txr_vat"]);
		expect(mockState.createCalls[0]?.automatic_tax).toBeUndefined();
	});

	test("a created subscription without manual tax rates enables automatic tax", async () => {
		await executeStripeSubscriptionOperation({
			ctx: automaticTaxCtx,
			billingContext: taxableCustomerContext,
			subscriptionAction: createAction({ customer: "cus_123" }),
		});

		expect(mockState.createCalls[0]?.automatic_tax).toEqual({ enabled: true });
	});
});
