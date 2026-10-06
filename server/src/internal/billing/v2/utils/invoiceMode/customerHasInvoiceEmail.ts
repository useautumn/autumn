import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";

/** Invoice mode delivers the invoice by email, so Autumn or Stripe must hold one for the customer. */
export const customerHasInvoiceEmail = ({
	fullCustomer,
	stripeCustomer,
}: {
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
}): boolean =>
	Boolean(fullCustomer.email?.trim() || stripeCustomer?.email?.trim());
