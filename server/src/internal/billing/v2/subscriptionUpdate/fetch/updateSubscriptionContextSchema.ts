import type { FullCusProduct, FullCustomer, FullProduct } from "@shared/index";
import type Stripe from "stripe";

export type UpdateSubscriptionContext = {
	fullCustomer: FullCustomer;
	fullProducts: FullProduct[];
	customerProduct: FullCusProduct;
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeCustomer: Stripe.Customer;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;
};
