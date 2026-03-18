import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type BillingUpdateGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type BillingUpdateFeatureQuantity = {
    /**
     * The ID of the feature to set quantity for.
     */
    featureId: string;
    /**
     * The quantity of the feature.
     */
    quantity?: number | undefined;
    /**
     * Whether the customer can adjust the quantity.
     */
    adjustable?: boolean | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const BillingUpdatePriceInterval: {
    readonly OneOff: "one_off";
    readonly Week: "week";
    readonly Month: "month";
    readonly Quarter: "quarter";
    readonly SemiAnnual: "semi_annual";
    readonly Year: "year";
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export type BillingUpdatePriceInterval = ClosedEnum<typeof BillingUpdatePriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type BillingUpdateBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: BillingUpdatePriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const BillingUpdateResetInterval: {
    readonly OneOff: "one_off";
    readonly Minute: "minute";
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
    readonly Quarter: "quarter";
    readonly SemiAnnual: "semi_annual";
    readonly Year: "year";
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export type BillingUpdateResetInterval = ClosedEnum<typeof BillingUpdateResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type BillingUpdateReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: BillingUpdateResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type BillingUpdateTo = number | string;
export type BillingUpdateTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const BillingUpdateTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type BillingUpdateTierBehavior = ClosedEnum<typeof BillingUpdateTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const BillingUpdateItemPriceInterval: {
    readonly OneOff: "one_off";
    readonly Week: "week";
    readonly Month: "month";
    readonly Quarter: "quarter";
    readonly SemiAnnual: "semi_annual";
    readonly Year: "year";
};
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export type BillingUpdateItemPriceInterval = ClosedEnum<typeof BillingUpdateItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const BillingUpdateBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type BillingUpdateBillingMethod = ClosedEnum<typeof BillingUpdateBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type BillingUpdatePrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<BillingUpdateTier> | undefined;
    tierBehavior?: BillingUpdateTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: BillingUpdateItemPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Units per price increment. Usage is rounded UP when billed (e.g. billing_units=100 means 101 rounds to 200).
     */
    billingUnits?: number | undefined;
    /**
     * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
     */
    billingMethod: BillingUpdateBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const BillingUpdateOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type BillingUpdateOnIncrease = ClosedEnum<typeof BillingUpdateOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const BillingUpdateOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type BillingUpdateOnDecrease = ClosedEnum<typeof BillingUpdateOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type BillingUpdateProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: BillingUpdateOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: BillingUpdateOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const BillingUpdateExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type BillingUpdateExpiryDurationType = ClosedEnum<typeof BillingUpdateExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type BillingUpdateRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: BillingUpdateExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type BillingUpdatePlanItem = {
    /**
     * The ID of the feature to configure.
     */
    featureId: string;
    /**
     * Number of free units included. Balance resets to this each interval for consumable features.
     */
    included?: number | undefined;
    /**
     * If true, customer has unlimited access to this feature.
     */
    unlimited?: boolean | undefined;
    /**
     * Reset configuration for consumable features. Omit for non-consumable features like seats.
     */
    reset?: BillingUpdateReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: BillingUpdatePrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: BillingUpdateProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: BillingUpdateRollover | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const BillingUpdateDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type BillingUpdateDurationType = ClosedEnum<typeof BillingUpdateDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type BillingUpdateFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: BillingUpdateDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Customize the plan to attach. Can override the price, items, free trial, or a combination.
 */
export type BillingUpdateCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: BillingUpdateBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<BillingUpdatePlanItem> | undefined;
    /**
     * Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely.
     */
    freeTrial?: BillingUpdateFreeTrialParams | null | undefined;
};
/**
 * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
 */
export type BillingUpdateInvoiceMode = {
    /**
     * When true, creates an invoice and sends it to the customer instead of charging their card immediately. Uses Stripe's send_invoice collection method.
     */
    enabled: boolean;
    /**
     * If true, enables the plan immediately even though the invoice is not paid yet.
     */
    enablePlanImmediately?: boolean | undefined;
    /**
     * If true, finalizes the invoice so it can be sent to the customer. If false, keeps it as a draft for manual review.
     */
    finalize?: boolean | undefined;
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export declare const BillingUpdateProrationBehavior: {
    readonly ProrateImmediately: "prorate_immediately";
    readonly None: "none";
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export type BillingUpdateProrationBehavior = ClosedEnum<typeof BillingUpdateProrationBehavior>;
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export declare const BillingUpdateRedirectMode: {
    readonly Always: "always";
    readonly IfRequired: "if_required";
    readonly Never: "never";
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export type BillingUpdateRedirectMode = ClosedEnum<typeof BillingUpdateRedirectMode>;
/**
 * Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.
 */
export declare const BillingUpdateCancelAction: {
    readonly CancelImmediately: "cancel_immediately";
    readonly CancelEndOfCycle: "cancel_end_of_cycle";
    readonly Uncancel: "uncancel";
};
/**
 * Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.
 */
export type BillingUpdateCancelAction = ClosedEnum<typeof BillingUpdateCancelAction>;
export type UpdateSubscriptionParams = {
    /**
     * The ID of the customer to attach the plan to.
     */
    customerId: string;
    /**
     * The ID of the entity to attach the plan to.
     */
    entityId?: string | undefined;
    /**
     * The ID of the plan to update. Optional if subscription_id is provided, or if the customer has only one product.
     */
    planId?: string | undefined;
    /**
     * If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan.
     */
    featureQuantities?: Array<BillingUpdateFeatureQuantity> | undefined;
    /**
     * The version of the plan to attach.
     */
    version?: number | undefined;
    /**
     * Customize the plan to attach. Can override the price, items, free trial, or a combination.
     */
    customize?: BillingUpdateCustomize | undefined;
    /**
     * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
     */
    invoiceMode?: BillingUpdateInvoiceMode | undefined;
    /**
     * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
     */
    prorationBehavior?: BillingUpdateProrationBehavior | undefined;
    /**
     * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
     */
    redirectMode?: BillingUpdateRedirectMode | undefined;
    /**
     * A unique ID to identify this subscription. Can be used to target specific subscriptions in update operations when a customer has multiple products with the same plan.
     */
    subscriptionId?: string | undefined;
    /**
     * Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.
     */
    cancelAction?: BillingUpdateCancelAction | undefined;
    /**
     * If true, the subscription is updated internally without applying billing changes in Stripe.
     */
    noBillingChanges?: boolean | undefined;
};
/**
 * Invoice details if an invoice was created. Only present when a charge was made.
 */
export type BillingUpdateInvoice = {
    /**
     * The status of the invoice (e.g., 'paid', 'open', 'draft').
     */
    status: string | null;
    /**
     * The Stripe invoice ID.
     */
    stripeId: string;
    /**
     * The total amount of the invoice in cents.
     */
    total: number;
    /**
     * The three-letter ISO currency code (e.g., 'usd').
     */
    currency: string;
    /**
     * URL to the hosted invoice page where the customer can view and pay the invoice.
     */
    hostedInvoiceUrl: string | null;
};
/**
 * The type of action required to complete the payment.
 */
export declare const BillingUpdateCode: {
    readonly ThreedsRequired: "3ds_required";
    readonly PaymentMethodRequired: "payment_method_required";
    readonly PaymentFailed: "payment_failed";
};
/**
 * The type of action required to complete the payment.
 */
export type BillingUpdateCode = OpenEnum<typeof BillingUpdateCode>;
/**
 * Details about any action required to complete the payment. Present when the payment could not be processed automatically.
 */
export type BillingUpdateRequiredAction = {
    /**
     * The type of action required to complete the payment.
     */
    code: BillingUpdateCode;
    /**
     * A human-readable explanation of why this action is required.
     */
    reason: string;
};
/**
 * OK
 */
export type BillingUpdateResponse = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * The ID of the entity, if the plan was attached to an entity.
     */
    entityId?: string | undefined;
    /**
     * Invoice details if an invoice was created. Only present when a charge was made.
     */
    invoice?: BillingUpdateInvoice | undefined;
    /**
     * URL to redirect the customer to complete payment. Null if no payment action is required.
     */
    paymentUrl: string | null;
    /**
     * Details about any action required to complete the payment. Present when the payment could not be processed automatically.
     */
    requiredAction?: BillingUpdateRequiredAction | undefined;
};
/** @internal */
export type BillingUpdateFeatureQuantity$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const BillingUpdateFeatureQuantity$outboundSchema: z.ZodMiniType<BillingUpdateFeatureQuantity$Outbound, BillingUpdateFeatureQuantity>;
export declare function billingUpdateFeatureQuantityToJSON(billingUpdateFeatureQuantity: BillingUpdateFeatureQuantity): string;
/** @internal */
export declare const BillingUpdatePriceInterval$outboundSchema: z.ZodMiniEnum<typeof BillingUpdatePriceInterval>;
/** @internal */
export type BillingUpdateBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const BillingUpdateBasePrice$outboundSchema: z.ZodMiniType<BillingUpdateBasePrice$Outbound, BillingUpdateBasePrice>;
export declare function billingUpdateBasePriceToJSON(billingUpdateBasePrice: BillingUpdateBasePrice): string;
/** @internal */
export declare const BillingUpdateResetInterval$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateResetInterval>;
/** @internal */
export type BillingUpdateReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const BillingUpdateReset$outboundSchema: z.ZodMiniType<BillingUpdateReset$Outbound, BillingUpdateReset>;
export declare function billingUpdateResetToJSON(billingUpdateReset: BillingUpdateReset): string;
/** @internal */
export type BillingUpdateTo$Outbound = number | string;
/** @internal */
export declare const BillingUpdateTo$outboundSchema: z.ZodMiniType<BillingUpdateTo$Outbound, BillingUpdateTo>;
export declare function billingUpdateToToJSON(billingUpdateTo: BillingUpdateTo): string;
/** @internal */
export type BillingUpdateTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const BillingUpdateTier$outboundSchema: z.ZodMiniType<BillingUpdateTier$Outbound, BillingUpdateTier>;
export declare function billingUpdateTierToJSON(billingUpdateTier: BillingUpdateTier): string;
/** @internal */
export declare const BillingUpdateTierBehavior$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateTierBehavior>;
/** @internal */
export declare const BillingUpdateItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateItemPriceInterval>;
/** @internal */
export declare const BillingUpdateBillingMethod$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateBillingMethod>;
/** @internal */
export type BillingUpdatePrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<BillingUpdateTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const BillingUpdatePrice$outboundSchema: z.ZodMiniType<BillingUpdatePrice$Outbound, BillingUpdatePrice>;
export declare function billingUpdatePriceToJSON(billingUpdatePrice: BillingUpdatePrice): string;
/** @internal */
export declare const BillingUpdateOnIncrease$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateOnIncrease>;
/** @internal */
export declare const BillingUpdateOnDecrease$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateOnDecrease>;
/** @internal */
export type BillingUpdateProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const BillingUpdateProration$outboundSchema: z.ZodMiniType<BillingUpdateProration$Outbound, BillingUpdateProration>;
export declare function billingUpdateProrationToJSON(billingUpdateProration: BillingUpdateProration): string;
/** @internal */
export declare const BillingUpdateExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateExpiryDurationType>;
/** @internal */
export type BillingUpdateRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const BillingUpdateRollover$outboundSchema: z.ZodMiniType<BillingUpdateRollover$Outbound, BillingUpdateRollover>;
export declare function billingUpdateRolloverToJSON(billingUpdateRollover: BillingUpdateRollover): string;
/** @internal */
export type BillingUpdatePlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: BillingUpdateReset$Outbound | undefined;
    price?: BillingUpdatePrice$Outbound | undefined;
    proration?: BillingUpdateProration$Outbound | undefined;
    rollover?: BillingUpdateRollover$Outbound | undefined;
};
/** @internal */
export declare const BillingUpdatePlanItem$outboundSchema: z.ZodMiniType<BillingUpdatePlanItem$Outbound, BillingUpdatePlanItem>;
export declare function billingUpdatePlanItemToJSON(billingUpdatePlanItem: BillingUpdatePlanItem): string;
/** @internal */
export declare const BillingUpdateDurationType$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateDurationType>;
/** @internal */
export type BillingUpdateFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const BillingUpdateFreeTrialParams$outboundSchema: z.ZodMiniType<BillingUpdateFreeTrialParams$Outbound, BillingUpdateFreeTrialParams>;
export declare function billingUpdateFreeTrialParamsToJSON(billingUpdateFreeTrialParams: BillingUpdateFreeTrialParams): string;
/** @internal */
export type BillingUpdateCustomize$Outbound = {
    price?: BillingUpdateBasePrice$Outbound | null | undefined;
    items?: Array<BillingUpdatePlanItem$Outbound> | undefined;
    free_trial?: BillingUpdateFreeTrialParams$Outbound | null | undefined;
};
/** @internal */
export declare const BillingUpdateCustomize$outboundSchema: z.ZodMiniType<BillingUpdateCustomize$Outbound, BillingUpdateCustomize>;
export declare function billingUpdateCustomizeToJSON(billingUpdateCustomize: BillingUpdateCustomize): string;
/** @internal */
export type BillingUpdateInvoiceMode$Outbound = {
    enabled: boolean;
    enable_plan_immediately: boolean;
    finalize: boolean;
};
/** @internal */
export declare const BillingUpdateInvoiceMode$outboundSchema: z.ZodMiniType<BillingUpdateInvoiceMode$Outbound, BillingUpdateInvoiceMode>;
export declare function billingUpdateInvoiceModeToJSON(billingUpdateInvoiceMode: BillingUpdateInvoiceMode): string;
/** @internal */
export declare const BillingUpdateProrationBehavior$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateProrationBehavior>;
/** @internal */
export declare const BillingUpdateRedirectMode$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateRedirectMode>;
/** @internal */
export declare const BillingUpdateCancelAction$outboundSchema: z.ZodMiniEnum<typeof BillingUpdateCancelAction>;
/** @internal */
export type UpdateSubscriptionParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plan_id?: string | undefined;
    feature_quantities?: Array<BillingUpdateFeatureQuantity$Outbound> | undefined;
    version?: number | undefined;
    customize?: BillingUpdateCustomize$Outbound | undefined;
    invoice_mode?: BillingUpdateInvoiceMode$Outbound | undefined;
    proration_behavior?: string | undefined;
    redirect_mode: string;
    subscription_id?: string | undefined;
    cancel_action?: string | undefined;
    no_billing_changes?: boolean | undefined;
};
/** @internal */
export declare const UpdateSubscriptionParams$outboundSchema: z.ZodMiniType<UpdateSubscriptionParams$Outbound, UpdateSubscriptionParams>;
export declare function updateSubscriptionParamsToJSON(updateSubscriptionParams: UpdateSubscriptionParams): string;
/** @internal */
export declare const BillingUpdateInvoice$inboundSchema: z.ZodMiniType<BillingUpdateInvoice, unknown>;
export declare function billingUpdateInvoiceFromJSON(jsonString: string): SafeParseResult<BillingUpdateInvoice, SDKValidationError>;
/** @internal */
export declare const BillingUpdateCode$inboundSchema: z.ZodMiniType<BillingUpdateCode, unknown>;
/** @internal */
export declare const BillingUpdateRequiredAction$inboundSchema: z.ZodMiniType<BillingUpdateRequiredAction, unknown>;
export declare function billingUpdateRequiredActionFromJSON(jsonString: string): SafeParseResult<BillingUpdateRequiredAction, SDKValidationError>;
/** @internal */
export declare const BillingUpdateResponse$inboundSchema: z.ZodMiniType<BillingUpdateResponse, unknown>;
export declare function billingUpdateResponseFromJSON(jsonString: string): SafeParseResult<BillingUpdateResponse, SDKValidationError>;
