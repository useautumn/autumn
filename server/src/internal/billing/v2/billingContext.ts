import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";
import type Stripe from "stripe";

export interface BillingContext {
	fullCustomer: FullCustomer;
	stripeCustomer: Stripe.Customer;

	stripeSubscription?: Stripe.Subscription;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;
}
