import type { FullProduct } from "@autumn/shared";
import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";
import type Stripe from "stripe";

export interface BillingContext {
	fullCustomer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	fullProducts: FullProduct[];

	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;
}
