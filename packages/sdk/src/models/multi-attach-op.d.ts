import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { CustomerData, CustomerData$Outbound } from "./customer-data.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type MultiAttachGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const MultiAttachPriceInterval: {
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
export type MultiAttachPriceInterval = ClosedEnum<typeof MultiAttachPriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type MultiAttachBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: MultiAttachPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const MultiAttachResetInterval: {
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
export type MultiAttachResetInterval = ClosedEnum<typeof MultiAttachResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type MultiAttachReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: MultiAttachResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type MultiAttachTo = number | string;
export type MultiAttachTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const MultiAttachTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type MultiAttachTierBehavior = ClosedEnum<typeof MultiAttachTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const MultiAttachItemPriceInterval: {
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
export type MultiAttachItemPriceInterval = ClosedEnum<typeof MultiAttachItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const MultiAttachBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type MultiAttachBillingMethod = ClosedEnum<typeof MultiAttachBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type MultiAttachPrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<MultiAttachTier> | undefined;
    tierBehavior?: MultiAttachTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: MultiAttachItemPriceInterval;
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
    billingMethod: MultiAttachBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const MultiAttachOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type MultiAttachOnIncrease = ClosedEnum<typeof MultiAttachOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const MultiAttachOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type MultiAttachOnDecrease = ClosedEnum<typeof MultiAttachOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type MultiAttachProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: MultiAttachOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: MultiAttachOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const MultiAttachExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type MultiAttachExpiryDurationType = ClosedEnum<typeof MultiAttachExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type MultiAttachRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: MultiAttachExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type MultiAttachPlanItem = {
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
    reset?: MultiAttachReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: MultiAttachPrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: MultiAttachProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: MultiAttachRollover | undefined;
};
/**
 * Customize the plan to attach. Can override the price or items.
 */
export type MultiAttachCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: MultiAttachBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<MultiAttachPlanItem> | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type MultiAttachFeatureQuantity = {
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
export type MultiAttachPlan = {
    /**
     * The ID of the plan to attach.
     */
    planId: string;
    /**
     * Customize the plan to attach. Can override the price or items.
     */
    customize?: MultiAttachCustomize | undefined;
    /**
     * If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature.
     */
    featureQuantities?: Array<MultiAttachFeatureQuantity> | undefined;
    /**
     * The version of the plan to attach.
     */
    version?: number | undefined;
    /**
     * A unique ID to identify this subscription. Useful when attaching the same plan multiple times.
     */
    subscriptionId?: string | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const MultiAttachDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type MultiAttachDurationType = ClosedEnum<typeof MultiAttachDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type MultiAttachFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: MultiAttachDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately.
 */
export type MultiAttachInvoiceMode = {
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
 * A discount to apply. Can be either a reward ID or a promotion code.
 */
export type MultiAttachAttachDiscount = {
    /**
     * The ID of the reward to apply as a discount.
     */
    rewardId?: string | undefined;
    /**
     * The promotion code to apply as a discount.
     */
    promotionCode?: string | undefined;
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export declare const MultiAttachRedirectMode: {
    readonly Always: "always";
    readonly IfRequired: "if_required";
    readonly Never: "never";
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export type MultiAttachRedirectMode = ClosedEnum<typeof MultiAttachRedirectMode>;
export type MultiAttachSpendLimit = {
    /**
     * Optional feature ID this spend limit applies to.
     */
    featureId?: string | undefined;
    /**
     * Whether this spend limit is enabled.
     */
    enabled?: boolean | undefined;
    /**
     * Maximum allowed overage spend for the target feature.
     */
    overageLimit?: number | undefined;
};
/**
 * Billing controls for the entity.
 */
export type MultiAttachBillingControls = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<MultiAttachSpendLimit> | undefined;
};
export type MultiAttachEntityData = {
    /**
     * The feature ID that this entity is associated with
     */
    featureId: string;
    /**
     * Name of the entity
     */
    name?: string | undefined;
    /**
     * Billing controls for the entity.
     */
    billingControls?: MultiAttachBillingControls | undefined;
};
export type MultiAttachParams = {
    /**
     * The ID of the customer to attach the plans to.
     */
    customerId: string;
    /**
     * The ID of the entity to attach the plans to.
     */
    entityId?: string | undefined;
    /**
     * The list of plans to attach to the customer.
     */
    plans: Array<MultiAttachPlan>;
    /**
     * Free trial configuration applied to all plans. Pass an object to set a custom trial, or null to remove any trial.
     */
    freeTrial?: MultiAttachFreeTrialParams | null | undefined;
    /**
     * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately.
     */
    invoiceMode?: MultiAttachInvoiceMode | undefined;
    /**
     * List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.
     */
    discounts?: Array<MultiAttachAttachDiscount> | undefined;
    /**
     * URL to redirect to after successful checkout.
     */
    successUrl?: string | undefined;
    /**
     * Additional parameters to pass into the creation of the Stripe checkout session.
     */
    checkoutSessionParams?: {
        [k: string]: any;
    } | undefined;
    /**
     * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
     */
    redirectMode?: MultiAttachRedirectMode | undefined;
    /**
     * Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one.
     */
    newBillingSubscription?: boolean | undefined;
    /**
     * Customer details to set when creating a customer
     */
    customerData?: CustomerData | undefined;
    entityData?: MultiAttachEntityData | undefined;
};
/**
 * Invoice details if an invoice was created. Only present when a charge was made.
 */
export type MultiAttachInvoice = {
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
export declare const MultiAttachCode: {
    readonly ThreedsRequired: "3ds_required";
    readonly PaymentMethodRequired: "payment_method_required";
    readonly PaymentFailed: "payment_failed";
};
/**
 * The type of action required to complete the payment.
 */
export type MultiAttachCode = OpenEnum<typeof MultiAttachCode>;
/**
 * Details about any action required to complete the payment. Present when the payment could not be processed automatically.
 */
export type MultiAttachRequiredAction = {
    /**
     * The type of action required to complete the payment.
     */
    code: MultiAttachCode;
    /**
     * A human-readable explanation of why this action is required.
     */
    reason: string;
};
/**
 * OK
 */
export type MultiAttachResponse = {
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
    invoice?: MultiAttachInvoice | undefined;
    /**
     * URL to redirect the customer to complete payment. Null if no payment action is required.
     */
    paymentUrl: string | null;
    /**
     * Details about any action required to complete the payment. Present when the payment could not be processed automatically.
     */
    requiredAction?: MultiAttachRequiredAction | undefined;
};
/** @internal */
export declare const MultiAttachPriceInterval$outboundSchema: z.ZodMiniEnum<typeof MultiAttachPriceInterval>;
/** @internal */
export type MultiAttachBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const MultiAttachBasePrice$outboundSchema: z.ZodMiniType<MultiAttachBasePrice$Outbound, MultiAttachBasePrice>;
export declare function multiAttachBasePriceToJSON(multiAttachBasePrice: MultiAttachBasePrice): string;
/** @internal */
export declare const MultiAttachResetInterval$outboundSchema: z.ZodMiniEnum<typeof MultiAttachResetInterval>;
/** @internal */
export type MultiAttachReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const MultiAttachReset$outboundSchema: z.ZodMiniType<MultiAttachReset$Outbound, MultiAttachReset>;
export declare function multiAttachResetToJSON(multiAttachReset: MultiAttachReset): string;
/** @internal */
export type MultiAttachTo$Outbound = number | string;
/** @internal */
export declare const MultiAttachTo$outboundSchema: z.ZodMiniType<MultiAttachTo$Outbound, MultiAttachTo>;
export declare function multiAttachToToJSON(multiAttachTo: MultiAttachTo): string;
/** @internal */
export type MultiAttachTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const MultiAttachTier$outboundSchema: z.ZodMiniType<MultiAttachTier$Outbound, MultiAttachTier>;
export declare function multiAttachTierToJSON(multiAttachTier: MultiAttachTier): string;
/** @internal */
export declare const MultiAttachTierBehavior$outboundSchema: z.ZodMiniEnum<typeof MultiAttachTierBehavior>;
/** @internal */
export declare const MultiAttachItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof MultiAttachItemPriceInterval>;
/** @internal */
export declare const MultiAttachBillingMethod$outboundSchema: z.ZodMiniEnum<typeof MultiAttachBillingMethod>;
/** @internal */
export type MultiAttachPrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<MultiAttachTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const MultiAttachPrice$outboundSchema: z.ZodMiniType<MultiAttachPrice$Outbound, MultiAttachPrice>;
export declare function multiAttachPriceToJSON(multiAttachPrice: MultiAttachPrice): string;
/** @internal */
export declare const MultiAttachOnIncrease$outboundSchema: z.ZodMiniEnum<typeof MultiAttachOnIncrease>;
/** @internal */
export declare const MultiAttachOnDecrease$outboundSchema: z.ZodMiniEnum<typeof MultiAttachOnDecrease>;
/** @internal */
export type MultiAttachProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const MultiAttachProration$outboundSchema: z.ZodMiniType<MultiAttachProration$Outbound, MultiAttachProration>;
export declare function multiAttachProrationToJSON(multiAttachProration: MultiAttachProration): string;
/** @internal */
export declare const MultiAttachExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof MultiAttachExpiryDurationType>;
/** @internal */
export type MultiAttachRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const MultiAttachRollover$outboundSchema: z.ZodMiniType<MultiAttachRollover$Outbound, MultiAttachRollover>;
export declare function multiAttachRolloverToJSON(multiAttachRollover: MultiAttachRollover): string;
/** @internal */
export type MultiAttachPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: MultiAttachReset$Outbound | undefined;
    price?: MultiAttachPrice$Outbound | undefined;
    proration?: MultiAttachProration$Outbound | undefined;
    rollover?: MultiAttachRollover$Outbound | undefined;
};
/** @internal */
export declare const MultiAttachPlanItem$outboundSchema: z.ZodMiniType<MultiAttachPlanItem$Outbound, MultiAttachPlanItem>;
export declare function multiAttachPlanItemToJSON(multiAttachPlanItem: MultiAttachPlanItem): string;
/** @internal */
export type MultiAttachCustomize$Outbound = {
    price?: MultiAttachBasePrice$Outbound | null | undefined;
    items?: Array<MultiAttachPlanItem$Outbound> | undefined;
};
/** @internal */
export declare const MultiAttachCustomize$outboundSchema: z.ZodMiniType<MultiAttachCustomize$Outbound, MultiAttachCustomize>;
export declare function multiAttachCustomizeToJSON(multiAttachCustomize: MultiAttachCustomize): string;
/** @internal */
export type MultiAttachFeatureQuantity$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const MultiAttachFeatureQuantity$outboundSchema: z.ZodMiniType<MultiAttachFeatureQuantity$Outbound, MultiAttachFeatureQuantity>;
export declare function multiAttachFeatureQuantityToJSON(multiAttachFeatureQuantity: MultiAttachFeatureQuantity): string;
/** @internal */
export type MultiAttachPlan$Outbound = {
    plan_id: string;
    customize?: MultiAttachCustomize$Outbound | undefined;
    feature_quantities?: Array<MultiAttachFeatureQuantity$Outbound> | undefined;
    version?: number | undefined;
    subscription_id?: string | undefined;
};
/** @internal */
export declare const MultiAttachPlan$outboundSchema: z.ZodMiniType<MultiAttachPlan$Outbound, MultiAttachPlan>;
export declare function multiAttachPlanToJSON(multiAttachPlan: MultiAttachPlan): string;
/** @internal */
export declare const MultiAttachDurationType$outboundSchema: z.ZodMiniEnum<typeof MultiAttachDurationType>;
/** @internal */
export type MultiAttachFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const MultiAttachFreeTrialParams$outboundSchema: z.ZodMiniType<MultiAttachFreeTrialParams$Outbound, MultiAttachFreeTrialParams>;
export declare function multiAttachFreeTrialParamsToJSON(multiAttachFreeTrialParams: MultiAttachFreeTrialParams): string;
/** @internal */
export type MultiAttachInvoiceMode$Outbound = {
    enabled: boolean;
    enable_plan_immediately: boolean;
    finalize: boolean;
};
/** @internal */
export declare const MultiAttachInvoiceMode$outboundSchema: z.ZodMiniType<MultiAttachInvoiceMode$Outbound, MultiAttachInvoiceMode>;
export declare function multiAttachInvoiceModeToJSON(multiAttachInvoiceMode: MultiAttachInvoiceMode): string;
/** @internal */
export type MultiAttachAttachDiscount$Outbound = {
    reward_id?: string | undefined;
    promotion_code?: string | undefined;
};
/** @internal */
export declare const MultiAttachAttachDiscount$outboundSchema: z.ZodMiniType<MultiAttachAttachDiscount$Outbound, MultiAttachAttachDiscount>;
export declare function multiAttachAttachDiscountToJSON(multiAttachAttachDiscount: MultiAttachAttachDiscount): string;
/** @internal */
export declare const MultiAttachRedirectMode$outboundSchema: z.ZodMiniEnum<typeof MultiAttachRedirectMode>;
/** @internal */
export type MultiAttachSpendLimit$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const MultiAttachSpendLimit$outboundSchema: z.ZodMiniType<MultiAttachSpendLimit$Outbound, MultiAttachSpendLimit>;
export declare function multiAttachSpendLimitToJSON(multiAttachSpendLimit: MultiAttachSpendLimit): string;
/** @internal */
export type MultiAttachBillingControls$Outbound = {
    spend_limits?: Array<MultiAttachSpendLimit$Outbound> | undefined;
};
/** @internal */
export declare const MultiAttachBillingControls$outboundSchema: z.ZodMiniType<MultiAttachBillingControls$Outbound, MultiAttachBillingControls>;
export declare function multiAttachBillingControlsToJSON(multiAttachBillingControls: MultiAttachBillingControls): string;
/** @internal */
export type MultiAttachEntityData$Outbound = {
    feature_id: string;
    name?: string | undefined;
    billing_controls?: MultiAttachBillingControls$Outbound | undefined;
};
/** @internal */
export declare const MultiAttachEntityData$outboundSchema: z.ZodMiniType<MultiAttachEntityData$Outbound, MultiAttachEntityData>;
export declare function multiAttachEntityDataToJSON(multiAttachEntityData: MultiAttachEntityData): string;
/** @internal */
export type MultiAttachParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plans: Array<MultiAttachPlan$Outbound>;
    free_trial?: MultiAttachFreeTrialParams$Outbound | null | undefined;
    invoice_mode?: MultiAttachInvoiceMode$Outbound | undefined;
    discounts?: Array<MultiAttachAttachDiscount$Outbound> | undefined;
    success_url?: string | undefined;
    checkout_session_params?: {
        [k: string]: any;
    } | undefined;
    redirect_mode: string;
    new_billing_subscription?: boolean | undefined;
    customer_data?: CustomerData$Outbound | undefined;
    entity_data?: MultiAttachEntityData$Outbound | undefined;
};
/** @internal */
export declare const MultiAttachParams$outboundSchema: z.ZodMiniType<MultiAttachParams$Outbound, MultiAttachParams>;
export declare function multiAttachParamsToJSON(multiAttachParams: MultiAttachParams): string;
/** @internal */
export declare const MultiAttachInvoice$inboundSchema: z.ZodMiniType<MultiAttachInvoice, unknown>;
export declare function multiAttachInvoiceFromJSON(jsonString: string): SafeParseResult<MultiAttachInvoice, SDKValidationError>;
/** @internal */
export declare const MultiAttachCode$inboundSchema: z.ZodMiniType<MultiAttachCode, unknown>;
/** @internal */
export declare const MultiAttachRequiredAction$inboundSchema: z.ZodMiniType<MultiAttachRequiredAction, unknown>;
export declare function multiAttachRequiredActionFromJSON(jsonString: string): SafeParseResult<MultiAttachRequiredAction, SDKValidationError>;
/** @internal */
export declare const MultiAttachResponse$inboundSchema: z.ZodMiniType<MultiAttachResponse, unknown>;
export declare function multiAttachResponseFromJSON(jsonString: string): SafeParseResult<MultiAttachResponse, SDKValidationError>;
