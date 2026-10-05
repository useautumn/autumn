/** Invoice mode taxes automatically and blocks on a missing tax location instead of silently skipping tax. */

import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	requiresTaxLocation,
	shouldEnableStripeAutomaticTax,
} from "@/internal/billing/v2/providers/stripe/utils/tax/shouldEnableStripeAutomaticTax";
import { billingDetailsToTaxCalculationCustomerDetails } from "@/internal/billing/v2/utils/tax/billingDetailsToTaxCalculationCustomerDetails";
import { resolveTaxRateId } from "@/internal/billing/v2/utils/tax/resolveTaxRateId";

const ctx = ({ automaticTax = true }: { automaticTax?: boolean } = {}) =>
	({
		org: { id: "org_123", config: { automatic_tax: automaticTax } },
		env: "sandbox",
	}) as unknown as AutumnContext;

const invoiceModeContext = (
	overrides: Partial<BillingContext> = {},
): BillingContext =>
	({
		invoiceMode: { finalizeInvoice: true },
		stripeCustomer: { id: "cus_123", address: null, tax_exempt: "none" },
		...overrides,
	}) as unknown as BillingContext;

const located = { id: "cus_123", address: { country: "US" } };

describe("automatic tax in invoice mode", () => {
	test("enables automatic tax for an invoice-mode customer with an address", () => {
		const billingContext = invoiceModeContext({
			stripeCustomer: located as BillingContext["stripeCustomer"],
		});
		expect(shouldEnableStripeAutomaticTax({ ctx: ctx(), billingContext })).toBe(
			true,
		);
		expect(requiresTaxLocation({ ctx: ctx(), billingContext })).toBe(false);
	});

	test("requires a location when the customer has no address", () => {
		expect(
			requiresTaxLocation({ ctx: ctx(), billingContext: invoiceModeContext() }),
		).toBe(true);
	});

	test("an address in the request satisfies the location requirement", () => {
		const billingContext = invoiceModeContext({
			billingDetails: { address: { country: "US", postal_code: "94104" } },
		});
		expect(requiresTaxLocation({ ctx: ctx(), billingContext })).toBe(false);
	});

	test("exempt customers, a per-request opt-out, or a tax rate skip the requirement", () => {
		const cases: Partial<BillingContext>[] = [
			{ billingDetails: { tax_exempt: "exempt" } },
			{ automaticTaxEnabled: false },
			{ taxRateId: "txr_123" },
		];
		for (const overrides of cases) {
			expect(
				requiresTaxLocation({
					ctx: ctx(),
					billingContext: invoiceModeContext(overrides),
				}),
			).toBe(false);
		}
	});

	test("reverse-charge customers still need a location", () => {
		const billingContext = invoiceModeContext({
			billingDetails: { tax_exempt: "reverse" },
		});
		expect(requiresTaxLocation({ ctx: ctx(), billingContext })).toBe(true);
	});

	test("orgs without automatic tax and non-invoice requests are unaffected", () => {
		expect(
			requiresTaxLocation({
				ctx: ctx({ automaticTax: false }),
				billingContext: invoiceModeContext(),
			}),
		).toBe(false);
		expect(
			requiresTaxLocation({
				ctx: ctx(),
				billingContext: invoiceModeContext({ invoiceMode: undefined }),
			}),
		).toBe(false);
	});
});

describe("resolveTaxRateId", () => {
	test("tax.rate_id wins over the legacy tax_rate_id", () => {
		expect(
			resolveTaxRateId({ tax: { rate_id: "txr_new" }, taxRateId: "txr_old" }),
		).toBe("txr_new");
	});

	test("rejects a tax rate combined with enabled automatic tax", () => {
		expect(() =>
			resolveTaxRateId({
				tax: { automatic_tax: { enabled: true } },
				taxRateId: "txr_old",
			}),
		).toThrow();
	});
});

describe("billingDetailsToTaxCalculationCustomerDetails", () => {
	test("previews tax from typed details without the saved customer", () => {
		const details = billingDetailsToTaxCalculationCustomerDetails({
			billingContext: invoiceModeContext({
				billingDetails: {
					address: { country: "US", postal_code: "94104", state: "CA" },
					tax_ids: [{ type: "us_ein", value: "12-3456789" }],
					tax_exempt: "reverse",
				},
			}),
		});
		expect(details?.address?.country).toBe("US");
		expect(details?.tax_ids).toEqual([{ type: "us_ein", value: "12-3456789" }]);
		expect(details?.taxability_override).toBe("reverse_charge");
	});

	test("returns nothing when no request details are given", () => {
		expect(
			billingDetailsToTaxCalculationCustomerDetails({
				billingContext: invoiceModeContext(),
			}),
		).toBeUndefined();
	});
});
