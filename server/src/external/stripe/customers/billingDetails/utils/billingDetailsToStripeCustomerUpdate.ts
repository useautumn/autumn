import type { BillingDetailsParams } from "@autumn/shared";
import type Stripe from "stripe";

/** Stripe unsets a field when sent "", so null in our params maps to "". */
const nullToEmpty = <T>(value: T | null): T | "" => value ?? "";

const addressToStripeAddress = (
	address: NonNullable<BillingDetailsParams["address"]>,
): Stripe.AddressParam =>
	Object.fromEntries(
		Object.entries(address)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => [key, nullToEmpty(value)]),
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
			address: address === null ? "" : addressToStripeAddress(address),
		}),
		...(tax_exempt !== undefined && { tax_exempt }),
		...(customFields !== undefined && {
			invoice_settings: { custom_fields: nullToEmpty(customFields) },
		}),
	};
};
