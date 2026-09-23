import { describe, expect, test } from "bun:test";
import { ReissueInvoiceOverridesSchema } from "@autumn/shared";
import type Stripe from "stripe";
import { resolveReissueTax } from "@/internal/invoices/actions/reissue/resolveReissueTax";

const invoice = ({ automaticTax = false, manualTax = false } = {}) =>
	({
		automatic_tax: { enabled: automaticTax },
		default_tax_rates: manualTax ? [{ id: "txr_manual" }] : [],
	}) as Stripe.Invoice;

describe("reissue tax modes", () => {
	test("omitted overrides inherit automatic tax", () => {
		expect(
			resolveReissueTax({ stripeInvoice: invoice({ automaticTax: true }) }),
		).toEqual({
			automaticTax: true,
			defaultTaxRates: [],
			lineTaxRates: "inherit",
		});
	});
	test("omitted overrides preserve manual invoice and line rates", () => {
		expect(
			resolveReissueTax({ stripeInvoice: invoice({ manualTax: true }) }),
		).toEqual({
			automaticTax: false,
			defaultTaxRates: ["txr_manual"],
			lineTaxRates: "keep",
		});
	});
	test("automatic tax can be enabled on an untaxed replacement", () => {
		expect(
			resolveReissueTax({
				stripeInvoice: invoice(),
				overrides: { automatic_tax: true },
			}),
		).toEqual({
			automaticTax: true,
			defaultTaxRates: [],
			lineTaxRates: "inherit",
		});
	});
	test("enabling automatic tax drops inherited manual rates", () => {
		expect(
			resolveReissueTax({
				stripeInvoice: invoice({ manualTax: true }),
				overrides: { automatic_tax: true },
			}),
		).toEqual({
			automaticTax: true,
			defaultTaxRates: [],
			lineTaxRates: "inherit",
		});
	});
	test("no tax clears invoice and line rates", () => {
		expect(
			resolveReissueTax({
				stripeInvoice: invoice({ automaticTax: true }),
				overrides: { tax_rate_id: null },
			}),
		).toEqual({
			automaticTax: false,
			defaultTaxRates: [],
			lineTaxRates: "none",
		});
	});
	test("disabling automatic tax never reapplies Stripe Tax-generated rates", () => {
		expect(
			resolveReissueTax({
				stripeInvoice: invoice({ automaticTax: true }),
				overrides: { automatic_tax: false },
			}),
		).toEqual({
			automaticTax: false,
			defaultTaxRates: [],
			lineTaxRates: "inherit",
		});
	});
	test("an explicit manual rate replaces automatic tax", () => {
		expect(
			resolveReissueTax({
				stripeInvoice: invoice({ automaticTax: true }),
				overrides: { tax_rate_id: "txr_replacement" },
			}),
		).toEqual({
			automaticTax: false,
			defaultTaxRates: ["txr_replacement"],
			lineTaxRates: "inherit",
		});
	});
	test("rejects contradictory automatic and manual tax overrides", () => {
		for (const tax_rate_id of [null, "txr_manual"]) {
			expect(
				ReissueInvoiceOverridesSchema.safeParse({
					automatic_tax: true,
					tax_rate_id,
				}).success,
			).toBe(false);
		}
	});
});
