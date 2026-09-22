import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import { stripeInvoiceToPrefill } from "./stripeInvoiceToPrefill";

const invoice = (overrides: Partial<Stripe.Invoice>): Stripe.Invoice =>
	overrides as Stripe.Invoice;

describe("stripeInvoiceToPrefill", () => {
	it("maps the invoice's customer snapshot onto the form", () => {
		const prefill = stripeInvoiceToPrefill(
			invoice({
				customer_name: "Acme SAS",
				customer_address: {
					line1: "12 Rue de Rivoli",
					line2: null,
					city: "Paris",
					state: null,
					postal_code: "75004",
					country: "FR",
				},
				customer_tax_ids: [{ type: "eu_vat", value: "FR12345678901" }],
			}),
		);
		expect(prefill).toEqual({
			customerName: "Acme SAS",
			address: {
				line1: "12 Rue de Rivoli",
				line2: "",
				city: "Paris",
				state: "",
				postal_code: "75004",
				country: "FR",
			},
			taxIdOptionId: "FR:eu_vat",
			taxIdValue: "FR12345678901",
		});
	});

	it("picks the country-specific row for a shared type like eu_vat", () => {
		expect(
			stripeInvoiceToPrefill(
				invoice({
					customer_address: { country: "DE" } as Stripe.Address,
					customer_tax_ids: [{ type: "eu_vat", value: "DE123456789" }],
				}),
			).taxIdOptionId,
		).toBe("DE:eu_vat");
	});

	it("leaves the tax id empty when the invoice carries none", () => {
		const prefill = stripeInvoiceToPrefill(invoice({ customer_name: "Acme" }));
		expect(prefill.taxIdOptionId).toBeNull();
		expect(prefill.taxIdValue).toBe("");
	});

	it("returns nothing without an invoice", () => {
		expect(stripeInvoiceToPrefill(undefined)).toEqual({});
	});
});
