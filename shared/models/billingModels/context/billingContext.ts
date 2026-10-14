import type { BillingDetailsBillingParams } from "@api/billing/common/billingDetailsBillingParams";
import type {
	BillingBehavior,
	CancelAction,
	CheckoutMode,
	Entitlement,
	FeatureOptions,
	FreeTrial,
	Price,
	ProcessorType,
	TrialOnEnd,
} from "@autumn/shared";
import type { PaymentBehaviorIntent } from "@models/billingModels/context/paymentBehaviorIntent";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type { DbInvoiceLineItem } from "@models/cusModels/invoiceModels/invoiceLineItemTable";
import type { CusProduct } from "@models/cusProductModels/cusProductModels";
import { InvoicePaymentMethodSchema } from "@models/orgModels/orgConfig";
import type { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import type { ProrationBehaviorOverride } from "@utils/billingUtils/invoicingUtils/prorationUtils/prorationBehaviorOverride";
import type Stripe from "stripe";
import { z } from "zod/v4";
import type { FullCustomer } from "../../cusModels/fullCusModel";
import type { FullProduct } from "../../productModels/productModels";
import type { CustomerLicenseQuantity } from "../customerLicenseQuantity";
import type { StripeDiscountWithCoupon } from "../stripe/stripeDiscountWithCoupon";
import type { CustomerLicenseBillingContext } from "./customerLicenseBillingContext";

const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
	footer: z.string().optional(),
	memo: z.string().optional(),
	daysUntilDue: z.number().optional(),
	paymentMethodTypes: z.array(InvoicePaymentMethodSchema).optional(),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

export enum BillingVersion {
	V1 = "v1",
	V2 = "v2",
}

export const LATEST_BILLING_VERSION = BillingVersion.V2;
export interface TrialContext {
	freeTrial?: FreeTrial | null;
	trialEndsAt: number | null;
	customFreeTrial?: FreeTrial;
	appliesToBilling: boolean;
	cardRequired: boolean;
	onEnd?: TrialOnEnd;
	autumnManaged?: boolean;
}

export interface AnchorResetRefund {
	noPartialRefund: boolean;
	refundCycle?: {
		interval: EntInterval;
		intervalCount: number;
	};
}

export interface BillingContext {
	fullCustomer: FullCustomer;
	fullProducts: FullProduct[];

	featureQuantities: FeatureOptions[];
	adjustableFeatureQuantities?: string[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	transitionConfig?: TransitionConfig;
	invoiceMode?: InvoiceMode;

	currentEpochMs: number;
	billingCycleAnchorMs: number | "now";
	resetCycleAnchorMs: number | "now";
	billingStartsAt?: number;
	subscriptionBackdateStartMs?: number;
	requestedBillingCycleAnchor?: number | "now";
	requestedProrationBehavior?: BillingBehavior;
	prorationOverride?: ProrationBehaviorOverride;

	stripeCustomer?: Stripe.Customer;
	stripeSubscription?: Stripe.Subscription;
	canceledStripeSubscriptionId?: string;
	mismatchedStripeSubscriptionId?: string;
	replacedStripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeDiscounts?: StripeDiscountWithCoupon[];
	stripeTaxRate?: Stripe.TaxRate;
	paymentMethod?: Stripe.PaymentMethod;
	carriedSubscriptionParams?: Pick<
		Stripe.SubscriptionCreateParams,
		| "default_payment_method"
		| "default_source"
		| "collection_method"
		| "days_until_due"
		| "default_tax_rates"
		| "automatic_tax"
		| "payment_settings"
	>;

	customPrices?: Price[];
	customEnts?: Entitlement[];

	customerLicenseBillingContext?: CustomerLicenseBillingContext;

	trialContext?: TrialContext;
	isCustom?: boolean;

	cancelAction?: CancelAction;

	billingVersion: BillingVersion;
	successUrl?: string;
	checkoutSessionParams?: Record<string, unknown>;
	userMetadata?: Record<string, string>;
	taxRateId?: string;
	automaticTaxEnabled?: boolean;
	billingDetails?: BillingDetailsBillingParams;

	skipBillingChanges?: boolean;
	dryRunStripe?: boolean;

	checkoutMode?: CheckoutMode;

	enablePlanImmediately?: boolean;
	longLivedCheckout?: { id: string; expiresAt: number };
	accessStartsAt?: number;
	actionSource?: string;
	actionCustomerProductId?: string;

	anchorResetRefund?: AnchorResetRefund;

	storedChargeLineItems?: DbInvoiceLineItem[];
	storedRefundLineItems?: DbInvoiceLineItem[];

	refundLastPayment?: "prorated" | "full";
	subscriptionParams?: Record<string, unknown>;

	paymentBehaviorIntent?: PaymentBehaviorIntent;
	billingUpdatedTags?: string[];
	shouldFinalizeFirstInvoice?: boolean;
	skipCustomPaymentMethodGuard?: boolean;

	skipExternalPSPGuard?: boolean;

	processorTypeOverride?: ProcessorType;

	processorOverride?: NonNullable<CusProduct["processor"]>;
}
