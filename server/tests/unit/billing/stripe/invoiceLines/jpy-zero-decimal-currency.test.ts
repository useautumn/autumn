/**
 * Regression tests for #1159: proration amounts were 100x incorrect for
 * zero-decimal currencies (JPY) because the line-item -> Stripe converters
 * called `atmnToStripeAmount` WITHOUT passing the per-line-item currency,
 * causing it to default to "USD" and unconditionally multiply by 100.
 *
 * Fix: pass `context.currency` through to `atmnToStripeAmount` in
 *   - lineItemsToCreateInvoiceItemsParams
 *   - lineItemsToInvoiceAddLinesParams
 *   - lineItemsToSubscriptionAddInvoiceItemsParams
 *
 * These tests pin the per-converter behavior: JPY (zero-decimal) returns the
 * amount as-is; USD multiplies by 100.
 */
import { describe, expect, mock, test } from "bun:test";

// Stub the product-id resolver so the no-product line-item path returns undefined
// (its real impl reaches into a fully-shaped LineItem.context.price config).
mock.module(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToStripeProductId",
	() => ({
		lineItemToStripeProductId: ({
			lineItem,
		}: {
			lineItem: { stripeProductId?: string };
		}) => lineItem.stripeProductId,
	}),
);
mock.module(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToMetadata",
	() => ({ lineItemToMetadata: () => ({}) }),
);

import type { LineItem } from "@autumn/shared";
import { lineItemsToCreateInvoiceItemsParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToCreateInvoiceItemsParams";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { lineItemsToSubscriptionAddInvoiceItemsParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToSubscriptionAddInvoiceItemsParams";

const STRIPE_CUSTOMER_ID = "cus_test_zero_decimal";

const makeLineItem = ({
	amount,
	currency,
	stripeProductId,
}: {
	amount: number;
	currency: string;
	stripeProductId?: string;
}): LineItem =>
	({
		id: "li_test",
		amount,
		amountAfterDiscounts: amount,
		description: "Test line",
		discounts: [],
		chargeImmediately: true,
		stripeProductId,
		context: {
			price: {} as LineItem["context"]["price"],
			product: {} as LineItem["context"]["product"],
			currency,
			direction: amount >= 0 ? "charge" : "refund",
			now: Date.now(),
			billingTiming: "in_advance",
			discountable: true,
		},
		prorated: false,
	}) as unknown as LineItem;

describe("invoice line converters preserve zero-decimal currency (#1159)", () => {
	describe("lineItemsToCreateInvoiceItemsParams", () => {
		test("JPY (no product): amount preserved as-is (no x100)", () => {
			const [params] = lineItemsToCreateInvoiceItemsParams({
				stripeCustomerId: STRIPE_CUSTOMER_ID,
				lineItems: [makeLineItem({ amount: 1999, currency: "jpy" })],
			});
			expect(params.currency).toBe("jpy");
			expect(params.amount).toBe(1999);
		});

		test("USD (no product): amount multiplied by 100 (control)", () => {
			const [params] = lineItemsToCreateInvoiceItemsParams({
				stripeCustomerId: STRIPE_CUSTOMER_ID,
				lineItems: [makeLineItem({ amount: 19.99, currency: "usd" })],
			});
			expect(params.currency).toBe("usd");
			expect(params.amount).toBe(1999);
		});

		test("JPY with product: price_data.unit_amount preserved as-is", () => {
			const [params] = lineItemsToCreateInvoiceItemsParams({
				stripeCustomerId: STRIPE_CUSTOMER_ID,
				lineItems: [
					makeLineItem({
						amount: 4980,
						currency: "jpy",
						stripeProductId: "prod_business_jpy",
					}),
				],
			});
			expect(params.price_data?.unit_amount).toBe(4980);
			expect(params.price_data?.currency).toBe("jpy");
		});
	});

	describe("lineItemsToInvoiceAddLinesParams", () => {
		test("JPY (no product): amount preserved as-is", () => {
			const [line] = lineItemsToInvoiceAddLinesParams({
				lineItems: [makeLineItem({ amount: 1999, currency: "jpy" })],
			});
			expect(line.amount).toBe(1999);
		});

		test("USD (no product): amount x100 (control)", () => {
			const [line] = lineItemsToInvoiceAddLinesParams({
				lineItems: [makeLineItem({ amount: 19.99, currency: "usd" })],
			});
			expect(line.amount).toBe(1999);
		});

		test("JPY with product: price_data.unit_amount preserved as-is", () => {
			const [line] = lineItemsToInvoiceAddLinesParams({
				lineItems: [
					makeLineItem({
						amount: 4980,
						currency: "jpy",
						stripeProductId: "prod_business_jpy",
					}),
				],
			});
			expect(line.price_data?.unit_amount).toBe(4980);
			expect(line.price_data?.currency).toBe("jpy");
		});
	});

	describe("lineItemsToSubscriptionAddInvoiceItemsParams", () => {
		test("JPY: unit_amount preserved as-is", () => {
			const [item] = lineItemsToSubscriptionAddInvoiceItemsParams({
				lineItems: [
					makeLineItem({
						amount: 4980,
						currency: "jpy",
						stripeProductId: "prod_business_jpy",
					}),
				],
			});
			expect(item.price_data?.unit_amount).toBe(4980);
			expect(item.price_data?.currency).toBe("jpy");
		});

		test("USD: unit_amount multiplied by 100 (control)", () => {
			const [item] = lineItemsToSubscriptionAddInvoiceItemsParams({
				lineItems: [
					makeLineItem({
						amount: 49.8,
						currency: "usd",
						stripeProductId: "prod_business_usd",
					}),
				],
			});
			expect(item.price_data?.unit_amount).toBe(4980);
			expect(item.price_data?.currency).toBe("usd");
		});
	});

	test("the exact #1159 repro: JPY proration of 1999 -> Stripe amount 1999, not 199900", () => {
		const proration = makeLineItem({ amount: 1999, currency: "jpy" });
		const [createParams] = lineItemsToCreateInvoiceItemsParams({
			stripeCustomerId: STRIPE_CUSTOMER_ID,
			lineItems: [proration],
		});
		const [addLine] = lineItemsToInvoiceAddLinesParams({
			lineItems: [proration],
		});
		expect(createParams.amount).toBe(1999);
		expect(addLine.amount).toBe(1999);
		expect(createParams.amount).not.toBe(199900);
		expect(addLine.amount).not.toBe(199900);
	});
});
