import type { BillingVersion } from "@models/billingModels/context/billingContext";
import type { PaymentBehaviorIntent } from "@models/billingModels/context/paymentBehaviorIntent";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type { InsertPlanLicenseSpec } from "@models/billingModels/plan/customerLicensePlan";
import type { StripeDiscountWithCoupon } from "@models/billingModels/stripe/stripeDiscountWithCoupon";
import type { FullCustomer } from "@models/cusModels/fullCusModel";
import type {
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
	shouldFinalizeFirstInvoice?: boolean;

	/**
	 * Skips the "billed outside of Stripe" guard that normally blocks attach
	 * for customers managed by an external billing platform (Vercel marketplace).
	 * Internal callers that ARE the origin platform (e.g. Vercel marketplace
	 * webhook handlers) set this to opt out of the guard. Not exposed via any
	 * public API schema.
	 */
	skipCustomPaymentMethodGuard?: boolean;

	/**
	 * Skips fetching Stripe state (customer/subscription/schedule/discounts/PM)
	 * during attach setup. Used by external-PSP origin callers (e.g. RevenueCat
	 * webhook handlers) whose customers don't have a meaningful Stripe presence.
	 * Independent from `params.no_billing_changes`, which only blocks writes.
	 */
	skipBillingFetching?: boolean;

	/**
	 * Skips the external-PSP guard (`handleExternalPSPErrors`) and the
	 * "paid current product but no Stripe sub linked" guard. Used by callers
	 * that ARE the external origin platform (e.g. RevenueCat webhook handlers)
	 * and so must be allowed to attach onto their own existing non-Stripe
	 * cus_products. Not exposed via any public API schema.
	 */
	skipExternalPSPGuard?: boolean;

	/**
	 * Tags the newly-inserted customer_product's `processor.type` field. Used
	 * by external-PSP origin callers to mark the cus_product as managed by a
	 * non-Stripe processor (e.g. RevenueCat). Defaults to leaving `processor`
	 * unset, which `cusProductToProcessorType` resolves to Stripe.
	 */
	processorTypeOverride?: ProcessorType;
}

export interface UpdateSubscriptionBillingContextOverride
	extends BillingContextOverride {
	productContext?: {
		fullProduct: FullProduct;
		customerProduct: FullCusProduct;
		customPrices?: Price[];
		customEnts?: Entitlement[];
	};

	/** Build the context against this customer instead of fetching from DB.
	 * For fold-style callers (multiUpdate) whose customer carries prior updates. */
	projectedFullCustomer?: FullCustomer;

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
