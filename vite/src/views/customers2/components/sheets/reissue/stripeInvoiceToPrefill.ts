import { findStripeTaxIdOption } from "@autumn/shared";
import type Stripe from "stripe";
import type { ReissuePrefill } from "./useReissueForm";

/** The customer's current Stripe details, so the form edits rather than retypes. */
export const stripeInvoiceToPrefill = (
	stripeInvoice: Stripe.Invoice | undefined,
): ReissuePrefill => {
	if (!stripeInvoice) return {};
	const taxId = stripeInvoice.customer_tax_ids?.[0];
	const option = taxId
		? findStripeTaxIdOption({
				type: taxId.type,
				countryCode: stripeInvoice.customer_address?.country,
			})
		: undefined;
	return {
		customerName: stripeInvoice.customer_name,
		address: {
			line1: stripeInvoice.customer_address?.line1 ?? "",
			line2: stripeInvoice.customer_address?.line2 ?? "",
			city: stripeInvoice.customer_address?.city ?? "",
			state: stripeInvoice.customer_address?.state ?? "",
			postal_code: stripeInvoice.customer_address?.postal_code ?? "",
			country: stripeInvoice.customer_address?.country ?? "",
		},
		taxIdOptionId: option?.id ?? null,
		taxIdValue: taxId?.value ?? "",
	};
};
