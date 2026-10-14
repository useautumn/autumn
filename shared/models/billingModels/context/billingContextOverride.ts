import type { BillingVersion } from "@models/billingModels/context/billingContext";
import type { PaymentBehaviorIntent } from "@models/billingModels/context/paymentBehaviorIntent";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type { InsertPlanLicenseSpec } from "@models/billingModels/plan/customerLicensePlan";
import type { StripeDiscountWithCoupon } from "@models/billingModels/stripe/stripeDiscountWithCoupon";
import type { FullCustomer } from "@models/cusModels/fullCusModel";
import type {
	CusProduct,
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { ProcessorType } from "@models/genModels/genEnums";
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
	stripeTaxRate?: Stripe.TaxRate;
	canceledStripeSubscriptionId?: string;
	canceledStripeSubscription?: Stripe.Subscription;
	mismatchedStripeSubscriptionId?: string;
}

export interface BillingContextOverride {
	fullCustomer?: FullCustomer;

	stripeBillingContext?: StripeBillingContextOverride;

	productContext?: {
		fullProduct: FullProduct;
		customerProduct?: FullCusProduct;
		customPrices?: Price[];
		customEnts?: Entitlement[];
		insertPlanLicenses?: InsertPlanLicenseSpec[];
	};

	featureQuantities?: FeatureOptions[];
	transitionConfig?: TransitionConfig;
	billingVersion?: BillingVersion;
	endOfCycleMsOverride?: number;

	paymentBehaviorIntent?: PaymentBehaviorIntent;
	billingUpdatedTags?: string[];
	shouldFinalizeFirstInvoice?: boolean;

	skipCustomPaymentMethodGuard?: boolean;

	skipBillingFetching?: boolean;

	skipExternalPSPGuard?: boolean;

	processorTypeOverride?: ProcessorType;

	processorOverride?: NonNullable<CusProduct["processor"]>;
}

export interface UpdateSubscriptionBillingContextOverride
	extends BillingContextOverride {
	productContext?: {
		fullProduct: FullProduct;
		customerProduct: FullCusProduct;
		customPrices?: Price[];
		customEnts?: Entitlement[];
	};

	projectedFullCustomer?: FullCustomer;

	chargeExistingOverages?: boolean;

	skipExistingUsageCarry?: boolean;

	forceIsCustom?: boolean;
}
