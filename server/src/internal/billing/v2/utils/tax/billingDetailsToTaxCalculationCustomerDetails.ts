import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";

const TAXABILITY_OVERRIDES = {
	none: "none",
	exempt: "customer_exempt",
	reverse: "reverse_charge",
} as const;

export const billingDetailsToTaxCalculationCustomerDetails = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): Stripe.Tax.CalculationCreateParams.CustomerDetails | undefined => {
	const { billingDetails, stripeCustomer } = billingContext;
	if (!billingDetails) return undefined;

	const address = billingDetails.address ?? stripeCustomer?.address;
	if (!address?.country) return undefined;

	const taxExempt = billingDetails.tax_exempt ?? stripeCustomer?.tax_exempt;
	return {
		address: {
			country: address.country,
			line1: address.line1 ?? undefined,
			line2: address.line2 ?? undefined,
			city: address.city ?? undefined,
			state: address.state ?? undefined,
			postal_code: address.postal_code ?? undefined,
		},
		address_source: "billing",
		tax_ids: billingDetails.tax_ids?.map(({ type, value }) => ({
			type: type as Stripe.Tax.CalculationCreateParams.CustomerDetails.TaxId.Type,
			value,
		})),
		...(taxExempt
			? { taxability_override: TAXABILITY_OVERRIDES[taxExempt] }
			: {}),
	};
};
