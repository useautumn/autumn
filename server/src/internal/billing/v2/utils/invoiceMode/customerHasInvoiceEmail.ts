import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";

export const customerHasInvoiceEmail = ({
	fullCustomer,
	stripeCustomer,
}: {
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
}): boolean =>
	Boolean(fullCustomer.email?.trim() || stripeCustomer?.email?.trim());
