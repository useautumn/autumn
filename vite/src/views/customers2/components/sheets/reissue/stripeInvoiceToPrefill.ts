import { findStripeTaxIdOption } from "@autumn/shared";
import type Stripe from "stripe";
import type { ReissueAddress, ReissuePrefill } from "./useReissueForm";

const liveCustomer = (
	stripeInvoice: Stripe.Invoice,
): Stripe.Customer | undefined =>
	typeof stripeInvoice.customer === "object" &&
	stripeInvoice.customer &&
	!("deleted" in stripeInvoice.customer)
		? stripeInvoice.customer
		: undefined;

const addressToForm = (
	address: Stripe.Address | null | undefined,
): ReissueAddress => ({
	line1: address?.line1 ?? "",
	line2: address?.line2 ?? "",
	city: address?.city ?? "",
	state: address?.state ?? "",
	postal_code: address?.postal_code ?? "",
	country: address?.country ?? "",
});

/**
 * Prefills from the live Stripe customer when the invoice carries it expanded,
 * so an edit corrects the current record instead of pushing the invoice-time
 * snapshot back over it. The snapshot is the fallback.
 */
export const stripeInvoiceToPrefill = (
	stripeInvoice: Stripe.Invoice | undefined,
): ReissuePrefill => {
	if (!stripeInvoice) return {};
	const customer = liveCustomer(stripeInvoice);
	const address = customer ? customer.address : stripeInvoice.customer_address;
	const [taxId, ...otherTaxIds] = customer
		? (customer.tax_ids?.data ?? [])
		: (stripeInvoice.customer_tax_ids ?? []);
	const option = taxId
		? findStripeTaxIdOption({
				type: taxId.type,
				countryCode: address?.country,
			})
		: undefined;
	return {
		customerName: customer ? customer.name : stripeInvoice.customer_name,
		address: addressToForm(address),
		taxIdOptionId: option?.id ?? null,
		taxIdValue: taxId?.value ?? "",
		otherTaxIds: otherTaxIds.flatMap(({ type, value }) =>
			value ? [{ type, value }] : [],
		),
		taxIdsIncomplete: customer?.tax_ids?.has_more ?? false,
		chargesAutomatically:
			stripeInvoice.collection_method === "charge_automatically",
	};
};
