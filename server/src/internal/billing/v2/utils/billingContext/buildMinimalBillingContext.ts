import { BillingVersion, type FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";

/** Build a minimal BillingContext with just the fields createInvoiceForBilling needs. */
export const buildMinimalBillingContext = ({
	fullCustomer,
	stripeCustomerId,
	paymentMethod,
}: {
	fullCustomer: FullCustomer;
	stripeCustomerId: string;
	paymentMethod: Stripe.PaymentMethod;
}) => ({
	fullCustomer,
	fullProducts: [],
	featureQuantities: [],
	currentEpochMs: Date.now(),
	billingCycleAnchorMs: "now" as const,
	resetCycleAnchorMs: "now" as const,
	stripeCustomer: { id: stripeCustomerId } as Stripe.Customer,
	paymentMethod,
	billingVersion: BillingVersion.V2,
});
