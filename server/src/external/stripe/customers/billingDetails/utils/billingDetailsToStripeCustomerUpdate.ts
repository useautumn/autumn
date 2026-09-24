import type { BillingDetailsParams } from "@autumn/shared";
import type Stripe from "stripe";

// Stripe unsets a field when sent "", so every null in our params maps to "".

const addressToStripeAddress = (
	address: NonNullable<BillingDetailsParams["address"]>,
): Stripe.AddressParam =>
	Object.fromEntries(
		Object.entries(address)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => [key, value ?? ""]),
	);

export const billingDetailsToStripeCustomerUpdate = ({
	billingDetails,
}: {
	billingDetails: BillingDetailsParams;
}): Stripe.CustomerUpdateParams => {
	const { address, tax_exempt, invoice_settings } = billingDetails;
	const customFields = invoice_settings?.custom_fields;

	return {
		...(address !== undefined && {
			address: address ? addressToStripeAddress(address) : "",
		}),
		...(tax_exempt !== undefined && { tax_exempt }),
		...(customFields !== undefined && {
			invoice_settings: { custom_fields: customFields ?? "" },
		}),
	};
};
