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
			otherTaxIds: [],
			taxIdsIncomplete: false,
		});
	});

	it("flags a truncated registration list so the form does not replace it", () => {
		const prefill = stripeInvoiceToPrefill(
			invoice({
				customer: {
					id: "cus_1",
					object: "customer",
					tax_ids: {
						object: "list",
						data: [{ type: "eu_vat", value: "FR12345678901" }],
						has_more: true,
						url: "",
					},
				} as unknown as Stripe.Customer,
			}),
		);
		expect(prefill.taxIdsIncomplete).toBe(true);
	});

	it("keeps registrations beyond the first so an edit does not drop them", () => {
		const prefill = stripeInvoiceToPrefill(
			invoice({
				customer_address: { country: "FR" } as Stripe.Address,
				customer_tax_ids: [
					{ type: "eu_vat", value: "FR12345678901" },
					{ type: "eu_oss_vat", value: "EU123456789" },
				],
			}),
		);
		expect(prefill.taxIdValue).toBe("FR12345678901");
		expect(prefill.otherTaxIds).toEqual([
			{ type: "eu_oss_vat", value: "EU123456789" },
		]);
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

	it("prefers the expanded live customer over the invoice snapshot", () => {
		const prefill = stripeInvoiceToPrefill(
			invoice({
				customer_name: "Acme SAS",
				customer_address: {
					line1: "12 Rue de Rivoli",
					city: "Paris",
					country: "FR",
				} as Stripe.Address,
				customer_tax_ids: [{ type: "eu_vat", value: "FR12345678901" }],
				customer: {
					id: "cus_1",
					object: "customer",
					name: "Acme GmbH",
					address: {
						line1: "Unter den Linden 1",
						line2: null,
						city: "Berlin",
						state: null,
						postal_code: "10117",
						country: "DE",
					},
					tax_ids: {
						object: "list",
						data: [{ type: "eu_vat", value: "DE123456789" }],
						has_more: false,
						url: "",
					},
				} as unknown as Stripe.Customer,
			}),
		);
		expect(prefill).toEqual({
			customerName: "Acme GmbH",
			address: {
				line1: "Unter den Linden 1",
				line2: "",
				city: "Berlin",
				state: "",
				postal_code: "10117",
				country: "DE",
			},
			taxIdOptionId: "DE:eu_vat",
			taxIdValue: "DE123456789",
			otherTaxIds: [],
			taxIdsIncomplete: false,
		});
	});

	it("falls back to the snapshot when the customer is only an id or deleted", () => {
		expect(
			stripeInvoiceToPrefill(
				invoice({ customer: "cus_1", customer_name: "Acme SAS" }),
			).customerName,
		).toBe("Acme SAS");
		expect(
			stripeInvoiceToPrefill(
				invoice({
					customer: { id: "cus_1", object: "customer", deleted: true },
					customer_name: "Acme SAS",
				}),
			).customerName,
		).toBe("Acme SAS");
	});

	it("returns nothing without an invoice", () => {
		expect(stripeInvoiceToPrefill(undefined)).toEqual({});
	});
});
