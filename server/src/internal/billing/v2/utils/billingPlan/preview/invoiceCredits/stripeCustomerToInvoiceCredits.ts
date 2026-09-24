import type { PreviewInvoiceCredits } from "@autumn/shared";
import { stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";

/** Stripe stores credit as a negative balance; previews surface it positive. */
export const stripeCustomerToInvoiceCredits = ({
	stripeCustomer,
	currency,
}: {
	stripeCustomer?: Stripe.Customer;
	currency: string;
}): PreviewInvoiceCredits | undefined => {
	if (!stripeCustomer) return undefined;
	return {
		balance: stripeToAtmnAmount({
			amount: -(stripeCustomer.balance ?? 0),
			currency,
		}),
		currency,
	};
};
