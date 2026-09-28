import type { ApiBillingDetails } from "@autumn/shared";
import type Stripe from "stripe";

export const stripeCustomerToBillingDetails = ({
	stripeCustomer,
	taxIds,
}: {
	stripeCustomer: Stripe.Customer;
	taxIds: Stripe.TaxId[];
}): ApiBillingDetails => ({
	address: stripeCustomer.address ?? null,
	tax_ids: taxIds.map(({ type, value }) => ({ type, value })),
	tax_exempt: stripeCustomer.tax_exempt ?? null,
	invoice_settings: {
		custom_fields: stripeCustomer.invoice_settings.custom_fields ?? [],
	},
});
