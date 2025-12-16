import type {
	AttachBodyV1,
	FreeTrial,
	FullCusProduct,
	FullCustomer,
	FullProduct,
	LineItem,
	OngoingCusProductAction,
	ScheduledCusProductAction,
} from "@autumn/shared";
import type Stripe from "stripe";

export type AttachContext = {
	fullCus: FullCustomer;
	products: FullProduct[];
	freeTrial?: FreeTrial;

	// Stripe context
	stripeSub?: Stripe.Subscription;
	stripeCus: Stripe.Customer;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;

	ongoingCusProductAction?: OngoingCusProductAction;
	scheduledCusProductAction?: ScheduledCusProductAction;

	body: AttachBodyV1;
};

export type StripeSubAction = {
	type:
		| "create"
		| "update"
		| "cancel_immediately"
		| "cancel_at_period_end"
		| "none";
	subId?: string;
	items?: Stripe.SubscriptionUpdateParams.Item[];
};

export type StripeInvoiceAction = {
	items: Stripe.InvoiceAddLinesParams.Line[];
	onPaymentFailure: "return_url";
};

export type StripeCheckoutAction = {
	shouldCreate: boolean;
	reason?: string;
	params: Stripe.Checkout.SessionCreateParams;
};

export type AttachPlan = {
	autumnLineItems: LineItem[];

	// 1. Autumn actions
	ongoingCusProductAction?: OngoingCusProductAction;
	scheduledCusProductAction?: ScheduledCusProductAction;
	newCusProducts: FullCusProduct[];

	// 2. Checkout session?
	stripeCheckoutAction: StripeCheckoutAction;
	stripeSubAction: StripeSubAction;
	stripeInvoiceAction?: StripeInvoiceAction;
};
