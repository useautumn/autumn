import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { buildCheckoutSessionParams } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildCheckoutSessionParams";

const params: Stripe.Checkout.SessionCreateParams = {
	mode: "subscription",
	automatic_tax: { enabled: true },
	billing_address_collection: "required",
	customer_update: { address: "auto", name: "auto" },
	tax_id_collection: { enabled: true },
};

describe("checkout tax-ID overrides", () => {
	test("lets callers disable tax-ID collection without overriding other tax settings", () => {
		const result = buildCheckoutSessionParams({
			params,
			checkoutSessionParams: {
				tax_id_collection: { enabled: false },
				automatic_tax: { enabled: false },
				billing_address_collection: "auto",
				customer_update: { address: "never", name: "never" },
			},
		});

		expect(result.tax_id_collection).toEqual({ enabled: false });
		expect(result.automatic_tax).toEqual(params.automatic_tax);
		expect(result.billing_address_collection).toBe("required");
		expect(result.customer_update).toEqual(params.customer_update);
	});

	test("preserves an explicit tax-ID collection requirement", () => {
		const result = buildCheckoutSessionParams({
			params,
			checkoutSessionParams: {
				tax_id_collection: { enabled: true, required: "never" },
			},
		});

		expect(result.tax_id_collection).toEqual({
			enabled: true,
			required: "never",
		});
	});

	test("retains Autumn's default when callers omit tax-ID collection", () => {
		const result = buildCheckoutSessionParams({ params });

		expect(result.tax_id_collection).toEqual({ enabled: true });
	});
});
