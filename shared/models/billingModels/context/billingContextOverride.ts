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
	transitionConfig?: TransitionConfig;
	billingVersion?: BillingVersion;
	endOfCycleMsOverride?: number;
	skipSubscriptionScheduleUpdates?: boolean;
}

export interface UpdateSubscriptionBillingContextOverride
	extends BillingContextOverride {
	productContext?: {
		fullProduct: FullProduct;
		customerProduct: FullCusProduct;
		customPrices?: Price[];
		customEnts?: Entitlement[];
	};

	/**
	 * When true, `buildAutumnLineItems` is called with
	 * `includeArrearLineItems: true` — existing consumable overage on the
	 * outgoing customer_product is invoiced as part of this update. Default
	 * (`updateSubscription`) skips arrear line items; `attach` includes them.
	 */
	chargeExistingOverages?: boolean;

	/**
	 * When true, the new customer_product is initialized WITHOUT carrying
	 * existing consumable usages from the outgoing customer_product (balances
	 * reset to the canonical starting balance from `getStartingBalance`).
	 * Default behavior carries all consumable usages forward. Pair with
	 * `chargeExistingOverages: true` to invoice the prior overage AND start
	 * the new cycle fresh.
	 */
	skipExistingUsageCarry?: boolean;

	/**
	 * Override the auto-computed `is_custom` flag on the new customer_product
	 * (default derives from `hasCustomItems(params.customize)`). Pass `false`
	 * to force the new cusProduct to be marked as a canonical (non-custom)
	 * instance even when the customize plan would otherwise look custom.
	 */
	forceIsCustom?: boolean;
}
