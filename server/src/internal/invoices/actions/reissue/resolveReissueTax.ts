import type { ReissueInvoiceOverrides } from "@autumn/shared";
import type Stripe from "stripe";

export const resolveReissueTax = ({
	stripeInvoice,
	overrides,
}: {
	stripeInvoice: Stripe.Invoice;
	overrides?: ReissueInvoiceOverrides;
}) => {
	const automaticTax =
		overrides?.tax_rate_id !== undefined
			? false
			: (overrides?.automatic_tax ?? stripeInvoice.automatic_tax.enabled);
	const defaultTaxRates =
		automaticTax || overrides?.tax_rate_id === null
			? []
			: overrides?.tax_rate_id
				? [overrides.tax_rate_id]
				: stripeInvoice.default_tax_rates.map((rate) => rate.id);
	const lineTaxRates: "none" | "inherit" | "keep" =
		overrides?.tax_rate_id === null
			? "none"
			: automaticTax ||
					stripeInvoice.automatic_tax.enabled ||
					overrides?.tax_rate_id
				? "inherit"
				: "keep";
	return { automaticTax, defaultTaxRates, lineTaxRates };
};
