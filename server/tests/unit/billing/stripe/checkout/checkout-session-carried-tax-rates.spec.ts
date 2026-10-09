/** A Checkout recreate keeps the old subscription's manual tax rates, so Stripe's automatic tax stays off. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

await mockModuleWithRestore(
	"@server/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildStripeCheckoutSessionItems",
	() => ({
		buildStripeCheckoutSessionItems: () => ({
			recurringLineItems: [{ price: "price_pro", quantity: 1 }],
			oneOffLineItems: [],
		}),
	}),
);

const { buildStripeCheckoutSessionAction } = await import(
	"@/internal/billing/v2/providers/stripe/actionBuilders/buildStripeCheckoutSessionAction"
);

const ctx = {
	org: { config: { automatic_tax: true }, stripe_config: {} },
	env: "sandbox",
} as unknown as AutumnContext;

const checkoutParams = (billingContext: Partial<BillingContext>) =>
	buildStripeCheckoutSessionAction({
		ctx,
		billingContext: {
			currentEpochMs: Date.UTC(2026, 9, 8),
			...billingContext,
		} as BillingContext,
		autumnBillingPlan: {
			insertCustomerProducts: [],
		} as unknown as AutumnBillingPlan,
	}).params;

describe("buildStripeCheckoutSessionAction tax", () => {
	afterAll(() => {
		mock.restore();
	});

	test("carried manual tax rates replace the org's automatic tax", () => {
		const params = checkoutParams({
			carriedSubscriptionParams: { default_tax_rates: ["txr_vat"] },
		});

		expect(params.subscription_data?.default_tax_rates).toEqual(["txr_vat"]);
		expect(params.automatic_tax).toBeUndefined();
	});

	test("without carried rates the org's automatic tax applies", () => {
		const params = checkoutParams({});

		expect(params.subscription_data?.default_tax_rates).toBeUndefined();
		expect(params.automatic_tax).toEqual({ enabled: true });
	});
});
