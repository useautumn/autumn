import { describe, expect, test } from "bun:test";
import type { LineItem } from "@autumn/shared";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { lineItemToStripeUnitPricing } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToStripeUnitPricing";

const usageLine = ({
	amount,
	amountAfterDiscounts = amount,
	unitPricing,
	currency = "usd",
	discountable = true,
	description = "Pro · Messages — 150 @ $0.50 (volume tier 101–200)",
}: {
	amount: number;
	amountAfterDiscounts?: number;
	unitPricing?: LineItem["unitPricing"];
	currency?: string;
	discountable?: boolean;
	description?: string;
}) =>
	({
		id: "invoice_li_test",
		amount,
		amountAfterDiscounts,
		discounts: [],
		description,
		unitPricing,
		chargeImmediately: true,
		prorated: false,
		context: {
			currency,
			discountable,
			direction: "charge",
			product: { id: "pro", name: "Pro" },
			price: {
				id: "price_messages",
				config: { type: "usage", stripe_product_id: "prod_messages" },
			},
		},
	}) as unknown as LineItem;

describe("lineItemToStripeUnitPricing", () => {
	test("sends quantity × unit amount when it equals the billed amount", () => {
		expect(
			lineItemToStripeUnitPricing({
				lineItem: usageLine({
					amount: 75,
					unitPricing: { quantity: 150, unitAmount: 0.5 },
				}),
			}),
		).toEqual({ quantity: 150, unitAmountDecimal: "50" });
	});

	test("keeps sub-cent rates as a decimal unit amount", () => {
		expect(
			lineItemToStripeUnitPricing({
				lineItem: usageLine({
					amount: 49.95,
					unitPricing: { quantity: 150, unitAmount: 0.333 },
				}),
			}),
		).toEqual({ quantity: 150, unitAmountDecimal: "33.3" });
	});

	test("uses the currency's minor units (JPY has none)", () => {
		expect(
			lineItemToStripeUnitPricing({
				lineItem: usageLine({
					amount: 1500,
					currency: "jpy",
					unitPricing: { quantity: 3, unitAmount: 500 },
				}),
			}),
		).toEqual({ quantity: 3, unitAmountDecimal: "500" });
	});

	describe("falls back to quantity 1 × total", () => {
		test("when the product would not land on a whole minor unit", () => {
			expect(
				lineItemToStripeUnitPricing({
					lineItem: usageLine({
						amount: 0.01,
						unitPricing: { quantity: 7, unitAmount: 0.0015 },
					}),
				}),
			).toBeUndefined();
		});

		test("when the rate needs more than Stripe's 12 decimal places", () => {
			const unitAmount = 1 / 3;
			expect(
				lineItemToStripeUnitPricing({
					lineItem: usageLine({
						amount: 1,
						unitPricing: { quantity: 3, unitAmount },
					}),
				}),
			).toBeUndefined();
		});

		test("when rounding drift moved the line off quantity × rate", () => {
			expect(
				lineItemToStripeUnitPricing({
					lineItem: usageLine({
						amount: 0.31,
						unitPricing: { quantity: 3, unitAmount: 0.105 },
					}),
				}),
			).toBeUndefined();
		});

		test("when the quantity is not a whole number", () => {
			expect(
				lineItemToStripeUnitPricing({
					lineItem: usageLine({
						amount: 1.25,
						unitPricing: { quantity: 2.5, unitAmount: 0.5 },
					}),
				}),
			).toBeUndefined();
		});

		test("when a non-discountable line was billed after discounts", () => {
			expect(
				lineItemToStripeUnitPricing({
					lineItem: usageLine({
						amount: 75,
						amountAfterDiscounts: 67.5,
						discountable: false,
						unitPricing: { quantity: 150, unitAmount: 0.5 },
					}),
				}),
			).toBeUndefined();
		});
	});
});

describe("lineItemsToInvoiceAddLinesParams", () => {
	test("a per-tier line is sent as quantity × unit_amount_decimal", () => {
		const [params] = lineItemsToInvoiceAddLinesParams({
			lineItems: [
				usageLine({
					amount: 75,
					unitPricing: { quantity: 150, unitAmount: 0.5 },
				}),
			],
		});

		expect(params.quantity).toBe(150);
		expect(params.amount).toBeUndefined();
		expect(params.price_data).toEqual({
			unit_amount_decimal: "50",
			currency: "usd",
			product: "prod_messages",
		});
	});

	test("the fallback is quantity 1 × the exact total, rate kept in the description", () => {
		const [params] = lineItemsToInvoiceAddLinesParams({
			lineItems: [
				usageLine({
					amount: 0.01,
					unitPricing: { quantity: 7, unitAmount: 0.0015 },
					description: "Pro · Tokens — 7 @ $0.0015",
				}),
			],
		});

		expect(params.quantity).toBeUndefined();
		expect(params.price_data).toEqual({
			unit_amount: 1,
			currency: "usd",
			product: "prod_messages",
		});
		expect(params.description).toBe("Pro · Tokens — 7 @ $0.0015");
	});

	test("a line without unit pricing is unchanged", () => {
		const [params] = lineItemsToInvoiceAddLinesParams({
			lineItems: [usageLine({ amount: 20.5 })],
		});

		expect(params.quantity).toBeUndefined();
		expect(params.price_data).toEqual({
			unit_amount: 2050,
			currency: "usd",
			product: "prod_messages",
		});
	});
});
