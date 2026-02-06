import type { BillingVersion } from "@models/billingModels/context/billingContext";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type { StripeDiscountWithCoupon } from "@models/billingModels/stripe/stripeDiscountWithCoupon";
import type { FullCustomer } from "@models/cusModels/fullCusModel";
import type {
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { Entitlement } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";
import type Stripe from "stripe";

export interface StripeBillingContextOverride {
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeCustomer: Stripe.Customer;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;
	stripeDiscounts: StripeDiscountWithCoupon[];
}

export interface BillingContextOverride {
	fullCustomer?: FullCustomer;

	stripeBillingContext?: StripeBillingContextOverride;

	productContext?: {
		fullProduct: FullProduct;
		customerProduct?: FullCusProduct;
		customPrices?: Price[];
		customEnts?: Entitlement[];
	};

	featureQuantities?: FeatureOptions[];
	transitionConfigs?: TransitionConfig[];
	billingVersion?: BillingVersion;
}

export interface UpdateSubscriptionBillingContextOverride
	extends BillingContextOverride {
	productContext?: {
		fullProduct: FullProduct;
		customerProduct: FullCusProduct;
		customPrices?: Price[];
		customEnts?: Entitlement[];
	};
}
