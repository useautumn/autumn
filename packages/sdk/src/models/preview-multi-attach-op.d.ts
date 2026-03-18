import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { CustomerData, CustomerData$Outbound } from "./customer-data.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type PreviewMultiAttachGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const PreviewMultiAttachPriceInterval: {
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
export type PreviewMultiAttachPriceInterval = ClosedEnum<typeof PreviewMultiAttachPriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type PreviewMultiAttachBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: PreviewMultiAttachPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const PreviewMultiAttachResetInterval: {
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
export type PreviewMultiAttachResetInterval = ClosedEnum<typeof PreviewMultiAttachResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type PreviewMultiAttachReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: PreviewMultiAttachResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type PreviewMultiAttachTo = number | string;
export type PreviewMultiAttachTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const PreviewMultiAttachTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type PreviewMultiAttachTierBehavior = ClosedEnum<typeof PreviewMultiAttachTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const PreviewMultiAttachItemPriceInterval: {
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
export type PreviewMultiAttachItemPriceInterval = ClosedEnum<typeof PreviewMultiAttachItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const PreviewMultiAttachBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type PreviewMultiAttachBillingMethod = ClosedEnum<typeof PreviewMultiAttachBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type PreviewMultiAttachPrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<PreviewMultiAttachTier> | undefined;
    tierBehavior?: PreviewMultiAttachTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: PreviewMultiAttachItemPriceInterval;
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
    billingMethod: PreviewMultiAttachBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const PreviewMultiAttachOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type PreviewMultiAttachOnIncrease = ClosedEnum<typeof PreviewMultiAttachOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const PreviewMultiAttachOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type PreviewMultiAttachOnDecrease = ClosedEnum<typeof PreviewMultiAttachOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type PreviewMultiAttachProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: PreviewMultiAttachOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: PreviewMultiAttachOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const PreviewMultiAttachExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type PreviewMultiAttachExpiryDurationType = ClosedEnum<typeof PreviewMultiAttachExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type PreviewMultiAttachRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: PreviewMultiAttachExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type PreviewMultiAttachPlanItem = {
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
    reset?: PreviewMultiAttachReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: PreviewMultiAttachPrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: PreviewMultiAttachProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: PreviewMultiAttachRollover | undefined;
};
/**
 * Customize the plan to attach. Can override the price or items.
 */
export type PreviewMultiAttachCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: PreviewMultiAttachBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<PreviewMultiAttachPlanItem> | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type PreviewMultiAttachPlanFeatureQuantity = {
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
export type PreviewMultiAttachPlan = {
    /**
     * The ID of the plan to attach.
     */
    planId: string;
    /**
     * Customize the plan to attach. Can override the price or items.
     */
    customize?: PreviewMultiAttachCustomize | undefined;
    /**
     * If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature.
     */
    featureQuantities?: Array<PreviewMultiAttachPlanFeatureQuantity> | undefined;
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
export declare const PreviewMultiAttachDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type PreviewMultiAttachDurationType = ClosedEnum<typeof PreviewMultiAttachDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type PreviewMultiAttachFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: PreviewMultiAttachDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately.
 */
export type PreviewMultiAttachInvoiceMode = {
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
export type PreviewMultiAttachAttachDiscount = {
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
export declare const PreviewMultiAttachRedirectMode: {
    readonly Always: "always";
    readonly IfRequired: "if_required";
    readonly Never: "never";
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export type PreviewMultiAttachRedirectMode = ClosedEnum<typeof PreviewMultiAttachRedirectMode>;
export type PreviewMultiAttachSpendLimit = {
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
export type PreviewMultiAttachBillingControls = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<PreviewMultiAttachSpendLimit> | undefined;
};
export type PreviewMultiAttachEntityData = {
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
    billingControls?: PreviewMultiAttachBillingControls | undefined;
};
export type PreviewMultiAttachParams = {
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
    plans: Array<PreviewMultiAttachPlan>;
    /**
     * Free trial configuration applied to all plans. Pass an object to set a custom trial, or null to remove any trial.
     */
    freeTrial?: PreviewMultiAttachFreeTrialParams | null | undefined;
    /**
     * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately.
     */
    invoiceMode?: PreviewMultiAttachInvoiceMode | undefined;
    /**
     * List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.
     */
    discounts?: Array<PreviewMultiAttachAttachDiscount> | undefined;
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
    redirectMode?: PreviewMultiAttachRedirectMode | undefined;
    /**
     * Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one.
     */
    newBillingSubscription?: boolean | undefined;
    /**
     * Customer details to set when creating a customer
     */
    customerData?: CustomerData | undefined;
    entityData?: PreviewMultiAttachEntityData | undefined;
};
export type PreviewMultiAttachDiscount = {
    amountOff: number;
    percentOff?: number | undefined;
    rewardId?: string | undefined;
    rewardName?: string | undefined;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewMultiAttachLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewMultiAttachLineItem = {
    /**
     * The name of the line item to display to the customer if you're building a UI. It will either be the plan name or the feature name.
     */
    displayName: string;
    /**
     * A detailed description of the line item.
     */
    description: string;
    /**
     * The amount in cents before discounts for this line item.
     */
    subtotal: number;
    /**
     * The final amount in cents after discounts for this line item.
     */
    total: number;
    /**
     * List of discounts applied to this line item.
     */
    discounts?: Array<PreviewMultiAttachDiscount> | undefined;
    /**
     * The ID of the plan that this line item belongs to.
     */
    planId: string;
    /**
     * The ID of the feature that this line item belongs to.
     */
    featureId: string | null;
    /**
     * The period of time that this line item is being charged for.
     */
    period?: PreviewMultiAttachLineItemPeriod | undefined;
    /**
     * The quantity of the line item.
     */
    quantity: number;
};
export type PreviewMultiAttachNextCycleDiscount = {
    amountOff: number;
    percentOff?: number | undefined;
    rewardId?: string | undefined;
    rewardName?: string | undefined;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewMultiAttachNextCycleLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewMultiAttachNextCycleLineItem = {
    /**
     * The name of the line item to display to the customer if you're building a UI. It will either be the plan name or the feature name.
     */
    displayName: string;
    /**
     * A detailed description of the line item.
     */
    description: string;
    /**
     * The amount in cents before discounts for this line item.
     */
    subtotal: number;
    /**
     * The final amount in cents after discounts for this line item.
     */
    total: number;
    /**
     * List of discounts applied to this line item.
     */
    discounts?: Array<PreviewMultiAttachNextCycleDiscount> | undefined;
    /**
     * The ID of the plan that this line item belongs to.
     */
    planId: string;
    /**
     * The ID of the feature that this line item belongs to.
     */
    featureId: string | null;
    /**
     * The period of time that this line item is being charged for.
     */
    period?: PreviewMultiAttachNextCycleLineItemPeriod | undefined;
    /**
     * The quantity of the line item.
     */
    quantity: number;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewMultiAttachUsageLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewMultiAttachUsageLineItem = {
    /**
     * The name of the line item to display to the customer if you're building a UI. It will either be the plan name or the feature name.
     */
    displayName: string;
    /**
     * The ID of the plan that this line item belongs to.
     */
    planId: string;
    /**
     * The ID of the feature that this line item belongs to.
     */
    featureId: string | null;
    /**
     * The period of time that this line item is being charged for.
     */
    period?: PreviewMultiAttachUsageLineItemPeriod | undefined;
};
/**
 * Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.
 */
export type PreviewMultiAttachNextCycle = {
    /**
     * Unix timestamp (milliseconds) when the next billing cycle starts.
     */
    startsAt: number;
    /**
     * The total amount in cents before discounts for the next cycle.
     */
    subtotal: number;
    /**
     * The final amount in cents after discounts for the next cycle.
     */
    total: number;
    /**
     * List of line items for the next billing cycle.
     */
    lineItems: Array<PreviewMultiAttachNextCycleLineItem>;
    /**
     * List of line items for usage-based features in the next cycle.
     */
    usageLineItems: Array<PreviewMultiAttachUsageLineItem>;
};
export type PreviewMultiAttachIncomingFeatureQuantity = {
    /**
     * The ID of the adjustable feature included in this change.
     */
    featureId: string;
    /**
     * The quantity that will apply for this feature in the change.
     */
    quantity: number;
};
export type PreviewMultiAttachIncoming = {
    /**
     * The ID of the plan affected by this preview change.
     */
    planId: string;
    plan?: Plan | undefined;
    /**
     * The feature quantity selections associated with this plan change.
     */
    featureQuantities: Array<PreviewMultiAttachIncomingFeatureQuantity>;
    /**
     * When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.
     */
    effectiveAt: number | null;
};
export type PreviewMultiAttachOutgoingFeatureQuantity = {
    /**
     * The ID of the adjustable feature included in this change.
     */
    featureId: string;
    /**
     * The quantity that will apply for this feature in the change.
     */
    quantity: number;
};
export type PreviewMultiAttachOutgoing = {
    /**
     * The ID of the plan affected by this preview change.
     */
    planId: string;
    plan?: Plan | undefined;
    /**
     * The feature quantity selections associated with this plan change.
     */
    featureQuantities: Array<PreviewMultiAttachOutgoingFeatureQuantity>;
    /**
     * When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.
     */
    effectiveAt: number | null;
};
/**
 * OK
 */
export type PreviewMultiAttachResponse = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * List of line items for the current billing period.
     */
    lineItems: Array<PreviewMultiAttachLineItem>;
    /**
     * The total amount in cents before discounts for the current billing period.
     */
    subtotal: number;
    /**
     * The final amount in cents after discounts for the current billing period.
     */
    total: number;
    /**
     * The three-letter ISO currency code (e.g., 'usd').
     */
    currency: string;
    /**
     * Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.
     */
    nextCycle?: PreviewMultiAttachNextCycle | undefined;
    /**
     * Expand the response with additional data.
     */
    expand?: Array<string> | undefined;
    /**
     * Products or subscription changes being added or updated.
     */
    incoming: Array<PreviewMultiAttachIncoming>;
    /**
     * Products or subscription changes being removed or ended.
     */
    outgoing: Array<PreviewMultiAttachOutgoing>;
};
/** @internal */
export declare const PreviewMultiAttachPriceInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachPriceInterval>;
/** @internal */
export type PreviewMultiAttachBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const PreviewMultiAttachBasePrice$outboundSchema: z.ZodMiniType<PreviewMultiAttachBasePrice$Outbound, PreviewMultiAttachBasePrice>;
export declare function previewMultiAttachBasePriceToJSON(previewMultiAttachBasePrice: PreviewMultiAttachBasePrice): string;
/** @internal */
export declare const PreviewMultiAttachResetInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachResetInterval>;
/** @internal */
export type PreviewMultiAttachReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const PreviewMultiAttachReset$outboundSchema: z.ZodMiniType<PreviewMultiAttachReset$Outbound, PreviewMultiAttachReset>;
export declare function previewMultiAttachResetToJSON(previewMultiAttachReset: PreviewMultiAttachReset): string;
/** @internal */
export type PreviewMultiAttachTo$Outbound = number | string;
/** @internal */
export declare const PreviewMultiAttachTo$outboundSchema: z.ZodMiniType<PreviewMultiAttachTo$Outbound, PreviewMultiAttachTo>;
export declare function previewMultiAttachToToJSON(previewMultiAttachTo: PreviewMultiAttachTo): string;
/** @internal */
export type PreviewMultiAttachTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const PreviewMultiAttachTier$outboundSchema: z.ZodMiniType<PreviewMultiAttachTier$Outbound, PreviewMultiAttachTier>;
export declare function previewMultiAttachTierToJSON(previewMultiAttachTier: PreviewMultiAttachTier): string;
/** @internal */
export declare const PreviewMultiAttachTierBehavior$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachTierBehavior>;
/** @internal */
export declare const PreviewMultiAttachItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachItemPriceInterval>;
/** @internal */
export declare const PreviewMultiAttachBillingMethod$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachBillingMethod>;
/** @internal */
export type PreviewMultiAttachPrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<PreviewMultiAttachTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const PreviewMultiAttachPrice$outboundSchema: z.ZodMiniType<PreviewMultiAttachPrice$Outbound, PreviewMultiAttachPrice>;
export declare function previewMultiAttachPriceToJSON(previewMultiAttachPrice: PreviewMultiAttachPrice): string;
/** @internal */
export declare const PreviewMultiAttachOnIncrease$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachOnIncrease>;
/** @internal */
export declare const PreviewMultiAttachOnDecrease$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachOnDecrease>;
/** @internal */
export type PreviewMultiAttachProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const PreviewMultiAttachProration$outboundSchema: z.ZodMiniType<PreviewMultiAttachProration$Outbound, PreviewMultiAttachProration>;
export declare function previewMultiAttachProrationToJSON(previewMultiAttachProration: PreviewMultiAttachProration): string;
/** @internal */
export declare const PreviewMultiAttachExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachExpiryDurationType>;
/** @internal */
export type PreviewMultiAttachRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const PreviewMultiAttachRollover$outboundSchema: z.ZodMiniType<PreviewMultiAttachRollover$Outbound, PreviewMultiAttachRollover>;
export declare function previewMultiAttachRolloverToJSON(previewMultiAttachRollover: PreviewMultiAttachRollover): string;
/** @internal */
export type PreviewMultiAttachPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: PreviewMultiAttachReset$Outbound | undefined;
    price?: PreviewMultiAttachPrice$Outbound | undefined;
    proration?: PreviewMultiAttachProration$Outbound | undefined;
    rollover?: PreviewMultiAttachRollover$Outbound | undefined;
};
/** @internal */
export declare const PreviewMultiAttachPlanItem$outboundSchema: z.ZodMiniType<PreviewMultiAttachPlanItem$Outbound, PreviewMultiAttachPlanItem>;
export declare function previewMultiAttachPlanItemToJSON(previewMultiAttachPlanItem: PreviewMultiAttachPlanItem): string;
/** @internal */
export type PreviewMultiAttachCustomize$Outbound = {
    price?: PreviewMultiAttachBasePrice$Outbound | null | undefined;
    items?: Array<PreviewMultiAttachPlanItem$Outbound> | undefined;
};
/** @internal */
export declare const PreviewMultiAttachCustomize$outboundSchema: z.ZodMiniType<PreviewMultiAttachCustomize$Outbound, PreviewMultiAttachCustomize>;
export declare function previewMultiAttachCustomizeToJSON(previewMultiAttachCustomize: PreviewMultiAttachCustomize): string;
/** @internal */
export type PreviewMultiAttachPlanFeatureQuantity$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const PreviewMultiAttachPlanFeatureQuantity$outboundSchema: z.ZodMiniType<PreviewMultiAttachPlanFeatureQuantity$Outbound, PreviewMultiAttachPlanFeatureQuantity>;
export declare function previewMultiAttachPlanFeatureQuantityToJSON(previewMultiAttachPlanFeatureQuantity: PreviewMultiAttachPlanFeatureQuantity): string;
/** @internal */
export type PreviewMultiAttachPlan$Outbound = {
    plan_id: string;
    customize?: PreviewMultiAttachCustomize$Outbound | undefined;
    feature_quantities?: Array<PreviewMultiAttachPlanFeatureQuantity$Outbound> | undefined;
    version?: number | undefined;
    subscription_id?: string | undefined;
};
/** @internal */
export declare const PreviewMultiAttachPlan$outboundSchema: z.ZodMiniType<PreviewMultiAttachPlan$Outbound, PreviewMultiAttachPlan>;
export declare function previewMultiAttachPlanToJSON(previewMultiAttachPlan: PreviewMultiAttachPlan): string;
/** @internal */
export declare const PreviewMultiAttachDurationType$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachDurationType>;
/** @internal */
export type PreviewMultiAttachFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const PreviewMultiAttachFreeTrialParams$outboundSchema: z.ZodMiniType<PreviewMultiAttachFreeTrialParams$Outbound, PreviewMultiAttachFreeTrialParams>;
export declare function previewMultiAttachFreeTrialParamsToJSON(previewMultiAttachFreeTrialParams: PreviewMultiAttachFreeTrialParams): string;
/** @internal */
export type PreviewMultiAttachInvoiceMode$Outbound = {
    enabled: boolean;
    enable_plan_immediately: boolean;
    finalize: boolean;
};
/** @internal */
export declare const PreviewMultiAttachInvoiceMode$outboundSchema: z.ZodMiniType<PreviewMultiAttachInvoiceMode$Outbound, PreviewMultiAttachInvoiceMode>;
export declare function previewMultiAttachInvoiceModeToJSON(previewMultiAttachInvoiceMode: PreviewMultiAttachInvoiceMode): string;
/** @internal */
export type PreviewMultiAttachAttachDiscount$Outbound = {
    reward_id?: string | undefined;
    promotion_code?: string | undefined;
};
/** @internal */
export declare const PreviewMultiAttachAttachDiscount$outboundSchema: z.ZodMiniType<PreviewMultiAttachAttachDiscount$Outbound, PreviewMultiAttachAttachDiscount>;
export declare function previewMultiAttachAttachDiscountToJSON(previewMultiAttachAttachDiscount: PreviewMultiAttachAttachDiscount): string;
/** @internal */
export declare const PreviewMultiAttachRedirectMode$outboundSchema: z.ZodMiniEnum<typeof PreviewMultiAttachRedirectMode>;
/** @internal */
export type PreviewMultiAttachSpendLimit$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const PreviewMultiAttachSpendLimit$outboundSchema: z.ZodMiniType<PreviewMultiAttachSpendLimit$Outbound, PreviewMultiAttachSpendLimit>;
export declare function previewMultiAttachSpendLimitToJSON(previewMultiAttachSpendLimit: PreviewMultiAttachSpendLimit): string;
/** @internal */
export type PreviewMultiAttachBillingControls$Outbound = {
    spend_limits?: Array<PreviewMultiAttachSpendLimit$Outbound> | undefined;
};
/** @internal */
export declare const PreviewMultiAttachBillingControls$outboundSchema: z.ZodMiniType<PreviewMultiAttachBillingControls$Outbound, PreviewMultiAttachBillingControls>;
export declare function previewMultiAttachBillingControlsToJSON(previewMultiAttachBillingControls: PreviewMultiAttachBillingControls): string;
/** @internal */
export type PreviewMultiAttachEntityData$Outbound = {
    feature_id: string;
    name?: string | undefined;
    billing_controls?: PreviewMultiAttachBillingControls$Outbound | undefined;
};
/** @internal */
export declare const PreviewMultiAttachEntityData$outboundSchema: z.ZodMiniType<PreviewMultiAttachEntityData$Outbound, PreviewMultiAttachEntityData>;
export declare function previewMultiAttachEntityDataToJSON(previewMultiAttachEntityData: PreviewMultiAttachEntityData): string;
/** @internal */
export type PreviewMultiAttachParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plans: Array<PreviewMultiAttachPlan$Outbound>;
    free_trial?: PreviewMultiAttachFreeTrialParams$Outbound | null | undefined;
    invoice_mode?: PreviewMultiAttachInvoiceMode$Outbound | undefined;
    discounts?: Array<PreviewMultiAttachAttachDiscount$Outbound> | undefined;
    success_url?: string | undefined;
    checkout_session_params?: {
        [k: string]: any;
    } | undefined;
    redirect_mode: string;
    new_billing_subscription?: boolean | undefined;
    customer_data?: CustomerData$Outbound | undefined;
    entity_data?: PreviewMultiAttachEntityData$Outbound | undefined;
};
/** @internal */
export declare const PreviewMultiAttachParams$outboundSchema: z.ZodMiniType<PreviewMultiAttachParams$Outbound, PreviewMultiAttachParams>;
export declare function previewMultiAttachParamsToJSON(previewMultiAttachParams: PreviewMultiAttachParams): string;
/** @internal */
export declare const PreviewMultiAttachDiscount$inboundSchema: z.ZodMiniType<PreviewMultiAttachDiscount, unknown>;
export declare function previewMultiAttachDiscountFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachDiscount, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewMultiAttachLineItemPeriod, unknown>;
export declare function previewMultiAttachLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachLineItem$inboundSchema: z.ZodMiniType<PreviewMultiAttachLineItem, unknown>;
export declare function previewMultiAttachLineItemFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachNextCycleDiscount$inboundSchema: z.ZodMiniType<PreviewMultiAttachNextCycleDiscount, unknown>;
export declare function previewMultiAttachNextCycleDiscountFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachNextCycleDiscount, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachNextCycleLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewMultiAttachNextCycleLineItemPeriod, unknown>;
export declare function previewMultiAttachNextCycleLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachNextCycleLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachNextCycleLineItem$inboundSchema: z.ZodMiniType<PreviewMultiAttachNextCycleLineItem, unknown>;
export declare function previewMultiAttachNextCycleLineItemFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachNextCycleLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachUsageLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewMultiAttachUsageLineItemPeriod, unknown>;
export declare function previewMultiAttachUsageLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachUsageLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachUsageLineItem$inboundSchema: z.ZodMiniType<PreviewMultiAttachUsageLineItem, unknown>;
export declare function previewMultiAttachUsageLineItemFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachUsageLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachNextCycle$inboundSchema: z.ZodMiniType<PreviewMultiAttachNextCycle, unknown>;
export declare function previewMultiAttachNextCycleFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachNextCycle, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachIncomingFeatureQuantity$inboundSchema: z.ZodMiniType<PreviewMultiAttachIncomingFeatureQuantity, unknown>;
export declare function previewMultiAttachIncomingFeatureQuantityFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachIncomingFeatureQuantity, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachIncoming$inboundSchema: z.ZodMiniType<PreviewMultiAttachIncoming, unknown>;
export declare function previewMultiAttachIncomingFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachIncoming, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachOutgoingFeatureQuantity$inboundSchema: z.ZodMiniType<PreviewMultiAttachOutgoingFeatureQuantity, unknown>;
export declare function previewMultiAttachOutgoingFeatureQuantityFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachOutgoingFeatureQuantity, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachOutgoing$inboundSchema: z.ZodMiniType<PreviewMultiAttachOutgoing, unknown>;
export declare function previewMultiAttachOutgoingFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachOutgoing, SDKValidationError>;
/** @internal */
export declare const PreviewMultiAttachResponse$inboundSchema: z.ZodMiniType<PreviewMultiAttachResponse, unknown>;
export declare function previewMultiAttachResponseFromJSON(jsonString: string): SafeParseResult<PreviewMultiAttachResponse, SDKValidationError>;
