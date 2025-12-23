import type {
	AttachBodyV1,
	FeatureOptions,
	FreeTrial,
	FullCusProduct,
	FullCustomer,
	FullCustomerPrice,
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

export type StripeCheckoutAction = {
	shouldCreate: boolean;
	reason?: string;
	params: Stripe.Checkout.SessionCreateParams;
};

export type UpdateOneOffAction = {
	targetCusProduct: FullCusProduct;
};

export type AttachPlan = {
	autumnLineItems: LineItem[];

	// 1. Autumn actions
	ongoingCusProductAction?: OngoingCusProductAction;
	scheduledCusProductAction?: ScheduledCusProductAction;
	updateOneOffAction?: UpdateOneOffAction;
	newCusProducts: FullCusProduct[];

	// 2. Checkout session?
	stripeCheckoutAction: StripeCheckoutAction;
	stripeSubAction: StripeSubAction;
	stripeInvoiceAction?: StripeInvoiceAction;
};

export type BillingPlan = {
	intent: "attach" | "update_quantity" | "update_plan" | "cancel" | "one_off";
};

export type BaseSubscriptionUpdatePlan = BillingPlan & {
	intent: "update_quantity" | "update_plan";
	autumnLineItems: LineItem[];
	stripeSubscriptionAction: StripeSubAction;
	ongoingCusProductAction: OngoingCusProductAction;
};

export type QuantityUpdateDetails = {
	featureId: string;
	internalFeatureId: string;

	previousFeatureQuantity: number;
	updatedFeatureQuantity: number;
	quantityDifferenceForEntitlements: number;
	stripeSubscriptionItemQuantityDifference: number;

	shouldApplyProration: boolean;
	shouldFinalizeInvoiceImmediately: boolean;
	billingUnitsPerQuantity: number;

	calculatedProrationAmountDollars?: number;
	subscriptionPeriodStartEpochMs: number;
	subscriptionPeriodEndEpochMs: number;

	stripeInvoiceItemDescription: string;

	customerPrice: FullCustomerPrice;
	stripePriceId: string;
	existingStripeSubscriptionItem?: Stripe.SubscriptionItem;

	customerEntitlementId?: string;
	customerEntitlementBalanceChange: number;
};

export type SubscriptionUpdateInvoiceAction = {
	shouldCreateInvoice: boolean;
	invoiceItems: {
		description: string;
		amountDollars: number;
		stripePriceId: string;
		periodStartEpochMs: number;
		periodEndEpochMs: number;
	}[];
	shouldChargeImmediately: boolean;
	paymentMethod?: Stripe.PaymentMethod;
	customerPrices: FullCustomerPrice[];
};

export type SubscriptionUpdateQuantityPlan = BaseSubscriptionUpdatePlan & {
	featureQuantities: {
		old: FeatureOptions[];
		new: FeatureOptions[];
	};
	quantityUpdateDetails: QuantityUpdateDetails[];
	invoiceAction?: SubscriptionUpdateInvoiceAction;
	shouldUncancelSubscription: boolean;
};

export type SubscriptionUpdatePlan = SubscriptionUpdateQuantityPlan;
