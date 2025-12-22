import type { FullCusProduct, FullCustomer } from "@shared/index";
import type Stripe from "stripe";

export type UpdateSubscriptionContext = {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	stripeSubscription: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeCustomer: Stripe.Customer;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;
};
