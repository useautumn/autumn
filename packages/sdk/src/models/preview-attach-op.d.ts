import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type PreviewAttachGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type PreviewAttachFeatureQuantityRequest = {
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
export declare const PreviewAttachPriceInterval: {
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
export type PreviewAttachPriceInterval = ClosedEnum<typeof PreviewAttachPriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type PreviewAttachBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: PreviewAttachPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const PreviewAttachResetInterval: {
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
export type PreviewAttachResetInterval = ClosedEnum<typeof PreviewAttachResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type PreviewAttachReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: PreviewAttachResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type PreviewAttachTo = number | string;
export type PreviewAttachTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const PreviewAttachTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type PreviewAttachTierBehavior = ClosedEnum<typeof PreviewAttachTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const PreviewAttachItemPriceInterval: {
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
export type PreviewAttachItemPriceInterval = ClosedEnum<typeof PreviewAttachItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const PreviewAttachBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type PreviewAttachBillingMethod = ClosedEnum<typeof PreviewAttachBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type PreviewAttachPrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<PreviewAttachTier> | undefined;
    tierBehavior?: PreviewAttachTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: PreviewAttachItemPriceInterval;
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
    billingMethod: PreviewAttachBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const PreviewAttachOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type PreviewAttachOnIncrease = ClosedEnum<typeof PreviewAttachOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const PreviewAttachOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type PreviewAttachOnDecrease = ClosedEnum<typeof PreviewAttachOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type PreviewAttachProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: PreviewAttachOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: PreviewAttachOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const PreviewAttachExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type PreviewAttachExpiryDurationType = ClosedEnum<typeof PreviewAttachExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type PreviewAttachRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: PreviewAttachExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type PreviewAttachPlanItem = {
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
    reset?: PreviewAttachReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: PreviewAttachPrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: PreviewAttachProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: PreviewAttachRollover | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const PreviewAttachDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type PreviewAttachDurationType = ClosedEnum<typeof PreviewAttachDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type PreviewAttachFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: PreviewAttachDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Customize the plan to attach. Can override the price, items, free trial, or a combination.
 */
export type PreviewAttachCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: PreviewAttachBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<PreviewAttachPlanItem> | undefined;
    /**
     * Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely.
     */
    freeTrial?: PreviewAttachFreeTrialParams | null | undefined;
};
/**
 * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
 */
export type PreviewAttachInvoiceMode = {
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
export declare const PreviewAttachProrationBehavior: {
    readonly ProrateImmediately: "prorate_immediately";
    readonly None: "none";
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export type PreviewAttachProrationBehavior = ClosedEnum<typeof PreviewAttachProrationBehavior>;
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export declare const PreviewAttachRedirectMode: {
    readonly Always: "always";
    readonly IfRequired: "if_required";
    readonly Never: "never";
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export type PreviewAttachRedirectMode = ClosedEnum<typeof PreviewAttachRedirectMode>;
/**
 * A discount to apply. Can be either a reward ID or a promotion code.
 */
export type PreviewAttachAttachDiscount = {
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
 * When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.
 */
export declare const PreviewAttachPlanSchedule: {
    readonly Immediate: "immediate";
    readonly EndOfCycle: "end_of_cycle";
};
/**
 * When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.
 */
export type PreviewAttachPlanSchedule = ClosedEnum<typeof PreviewAttachPlanSchedule>;
export type PreviewAttachCustomLineItem = {
    /**
     * Amount in dollars for this line item (e.g. 10.50). Can be negative for credits.
     */
    amount: number;
    /**
     * Description for the line item.
     */
    description: string;
};
/**
 * Whether to carry over balances from the previous plan.
 */
export type PreviewAttachCarryOverBalances = {
    /**
     * Whether to carry over balances from the previous plan.
     */
    enabled: boolean;
    /**
     * The IDs of the features to carry over balances from. If left undefined, all features will be carried over.
     */
    featureIds?: Array<string> | undefined;
};
/**
 * Whether to carry over usages from the previous plan.
 */
export type PreviewAttachCarryOverUsages = {
    /**
     * Whether to carry over usages from the previous plan.
     */
    enabled: boolean;
    /**
     * The IDs of the features to carry over usages for. If left undefined, all consumable features will be carried over.
     */
    featureIds?: Array<string> | undefined;
};
export type PreviewAttachParams = {
    /**
     * The ID of the customer to attach the plan to.
     */
    customerId: string;
    /**
     * The ID of the entity to attach the plan to.
     */
    entityId?: string | undefined;
    /**
     * The ID of the plan.
     */
    planId: string;
    /**
     * If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan.
     */
    featureQuantities?: Array<PreviewAttachFeatureQuantityRequest> | undefined;
    /**
     * The version of the plan to attach.
     */
    version?: number | undefined;
    /**
     * Customize the plan to attach. Can override the price, items, free trial, or a combination.
     */
    customize?: PreviewAttachCustomize | undefined;
    /**
     * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
     */
    invoiceMode?: PreviewAttachInvoiceMode | undefined;
    /**
     * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
     */
    prorationBehavior?: PreviewAttachProrationBehavior | undefined;
    /**
     * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
     */
    redirectMode?: PreviewAttachRedirectMode | undefined;
    /**
     * A unique ID to identify this subscription. Can be used to target specific subscriptions in update operations when a customer has multiple products with the same plan.
     */
    subscriptionId?: string | undefined;
    /**
     * List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.
     */
    discounts?: Array<PreviewAttachAttachDiscount> | undefined;
    /**
     * URL to redirect to after successful checkout.
     */
    successUrl?: string | undefined;
    /**
     * Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one.
     */
    newBillingSubscription?: boolean | undefined;
    /**
     * When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.
     */
    planSchedule?: PreviewAttachPlanSchedule | undefined;
    /**
     * Additional parameters to pass into the creation of the Stripe checkout session.
     */
    checkoutSessionParams?: {
        [k: string]: any;
    } | undefined;
    /**
     * Custom line items that override the auto-generated proration invoice. Only valid for immediate plan changes (eg. upgrades or one off plans).
     */
    customLineItems?: Array<PreviewAttachCustomLineItem> | undefined;
    /**
     * The processor subscription ID to link. Use this to attach an existing Stripe subscription instead of creating a new one.
     */
    processorSubscriptionId?: string | undefined;
    /**
     * Whether to carry over balances from the previous plan.
     */
    carryOverBalances?: PreviewAttachCarryOverBalances | undefined;
    /**
     * Whether to carry over usages from the previous plan.
     */
    carryOverUsages?: PreviewAttachCarryOverUsages | undefined;
};
export type PreviewAttachDiscount = {
    amountOff: number;
    percentOff?: number | undefined;
    rewardId?: string | undefined;
    rewardName?: string | undefined;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewAttachLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewAttachLineItem = {
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
    discounts?: Array<PreviewAttachDiscount> | undefined;
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
    period?: PreviewAttachLineItemPeriod | undefined;
    /**
     * The quantity of the line item.
     */
    quantity: number;
};
export type PreviewAttachNextCycleDiscount = {
    amountOff: number;
    percentOff?: number | undefined;
    rewardId?: string | undefined;
    rewardName?: string | undefined;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewAttachNextCycleLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewAttachNextCycleLineItem = {
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
    discounts?: Array<PreviewAttachNextCycleDiscount> | undefined;
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
    period?: PreviewAttachNextCycleLineItemPeriod | undefined;
    /**
     * The quantity of the line item.
     */
    quantity: number;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewAttachUsageLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewAttachUsageLineItem = {
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
    period?: PreviewAttachUsageLineItemPeriod | undefined;
};
/**
 * Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.
 */
export type PreviewAttachNextCycle = {
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
    lineItems: Array<PreviewAttachNextCycleLineItem>;
    /**
     * List of line items for usage-based features in the next cycle.
     */
    usageLineItems: Array<PreviewAttachUsageLineItem>;
};
export type PreviewAttachIncomingFeatureQuantity = {
    /**
     * The ID of the adjustable feature included in this change.
     */
    featureId: string;
    /**
     * The quantity that will apply for this feature in the change.
     */
    quantity: number;
};
export type PreviewAttachIncoming = {
    /**
     * The ID of the plan affected by this preview change.
     */
    planId: string;
    plan?: Plan | undefined;
    /**
     * The feature quantity selections associated with this plan change.
     */
    featureQuantities: Array<PreviewAttachIncomingFeatureQuantity>;
    /**
     * When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.
     */
    effectiveAt: number | null;
};
export type PreviewAttachOutgoingFeatureQuantity = {
    /**
     * The ID of the adjustable feature included in this change.
     */
    featureId: string;
    /**
     * The quantity that will apply for this feature in the change.
     */
    quantity: number;
};
export type PreviewAttachOutgoing = {
    /**
     * The ID of the plan affected by this preview change.
     */
    planId: string;
    plan?: Plan | undefined;
    /**
     * The feature quantity selections associated with this plan change.
     */
    featureQuantities: Array<PreviewAttachOutgoingFeatureQuantity>;
    /**
     * When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.
     */
    effectiveAt: number | null;
};
/**
 * OK
 */
export type PreviewAttachResponse = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * List of line items for the current billing period.
     */
    lineItems: Array<PreviewAttachLineItem>;
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
    nextCycle?: PreviewAttachNextCycle | undefined;
    /**
     * Expand the response with additional data.
     */
    expand?: Array<string> | undefined;
    /**
     * Products or subscription changes being added or updated.
     */
    incoming: Array<PreviewAttachIncoming>;
    /**
     * Products or subscription changes being removed or ended.
     */
    outgoing: Array<PreviewAttachOutgoing>;
};
/** @internal */
export type PreviewAttachFeatureQuantityRequest$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const PreviewAttachFeatureQuantityRequest$outboundSchema: z.ZodMiniType<PreviewAttachFeatureQuantityRequest$Outbound, PreviewAttachFeatureQuantityRequest>;
export declare function previewAttachFeatureQuantityRequestToJSON(previewAttachFeatureQuantityRequest: PreviewAttachFeatureQuantityRequest): string;
/** @internal */
export declare const PreviewAttachPriceInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachPriceInterval>;
/** @internal */
export type PreviewAttachBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const PreviewAttachBasePrice$outboundSchema: z.ZodMiniType<PreviewAttachBasePrice$Outbound, PreviewAttachBasePrice>;
export declare function previewAttachBasePriceToJSON(previewAttachBasePrice: PreviewAttachBasePrice): string;
/** @internal */
export declare const PreviewAttachResetInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachResetInterval>;
/** @internal */
export type PreviewAttachReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const PreviewAttachReset$outboundSchema: z.ZodMiniType<PreviewAttachReset$Outbound, PreviewAttachReset>;
export declare function previewAttachResetToJSON(previewAttachReset: PreviewAttachReset): string;
/** @internal */
export type PreviewAttachTo$Outbound = number | string;
/** @internal */
export declare const PreviewAttachTo$outboundSchema: z.ZodMiniType<PreviewAttachTo$Outbound, PreviewAttachTo>;
export declare function previewAttachToToJSON(previewAttachTo: PreviewAttachTo): string;
/** @internal */
export type PreviewAttachTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const PreviewAttachTier$outboundSchema: z.ZodMiniType<PreviewAttachTier$Outbound, PreviewAttachTier>;
export declare function previewAttachTierToJSON(previewAttachTier: PreviewAttachTier): string;
/** @internal */
export declare const PreviewAttachTierBehavior$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachTierBehavior>;
/** @internal */
export declare const PreviewAttachItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachItemPriceInterval>;
/** @internal */
export declare const PreviewAttachBillingMethod$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachBillingMethod>;
/** @internal */
export type PreviewAttachPrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<PreviewAttachTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const PreviewAttachPrice$outboundSchema: z.ZodMiniType<PreviewAttachPrice$Outbound, PreviewAttachPrice>;
export declare function previewAttachPriceToJSON(previewAttachPrice: PreviewAttachPrice): string;
/** @internal */
export declare const PreviewAttachOnIncrease$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachOnIncrease>;
/** @internal */
export declare const PreviewAttachOnDecrease$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachOnDecrease>;
/** @internal */
export type PreviewAttachProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const PreviewAttachProration$outboundSchema: z.ZodMiniType<PreviewAttachProration$Outbound, PreviewAttachProration>;
export declare function previewAttachProrationToJSON(previewAttachProration: PreviewAttachProration): string;
/** @internal */
export declare const PreviewAttachExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachExpiryDurationType>;
/** @internal */
export type PreviewAttachRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const PreviewAttachRollover$outboundSchema: z.ZodMiniType<PreviewAttachRollover$Outbound, PreviewAttachRollover>;
export declare function previewAttachRolloverToJSON(previewAttachRollover: PreviewAttachRollover): string;
/** @internal */
export type PreviewAttachPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: PreviewAttachReset$Outbound | undefined;
    price?: PreviewAttachPrice$Outbound | undefined;
    proration?: PreviewAttachProration$Outbound | undefined;
    rollover?: PreviewAttachRollover$Outbound | undefined;
};
/** @internal */
export declare const PreviewAttachPlanItem$outboundSchema: z.ZodMiniType<PreviewAttachPlanItem$Outbound, PreviewAttachPlanItem>;
export declare function previewAttachPlanItemToJSON(previewAttachPlanItem: PreviewAttachPlanItem): string;
/** @internal */
export declare const PreviewAttachDurationType$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachDurationType>;
/** @internal */
export type PreviewAttachFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const PreviewAttachFreeTrialParams$outboundSchema: z.ZodMiniType<PreviewAttachFreeTrialParams$Outbound, PreviewAttachFreeTrialParams>;
export declare function previewAttachFreeTrialParamsToJSON(previewAttachFreeTrialParams: PreviewAttachFreeTrialParams): string;
/** @internal */
export type PreviewAttachCustomize$Outbound = {
    price?: PreviewAttachBasePrice$Outbound | null | undefined;
    items?: Array<PreviewAttachPlanItem$Outbound> | undefined;
    free_trial?: PreviewAttachFreeTrialParams$Outbound | null | undefined;
};
/** @internal */
export declare const PreviewAttachCustomize$outboundSchema: z.ZodMiniType<PreviewAttachCustomize$Outbound, PreviewAttachCustomize>;
export declare function previewAttachCustomizeToJSON(previewAttachCustomize: PreviewAttachCustomize): string;
/** @internal */
export type PreviewAttachInvoiceMode$Outbound = {
    enabled: boolean;
    enable_plan_immediately: boolean;
    finalize: boolean;
};
/** @internal */
export declare const PreviewAttachInvoiceMode$outboundSchema: z.ZodMiniType<PreviewAttachInvoiceMode$Outbound, PreviewAttachInvoiceMode>;
export declare function previewAttachInvoiceModeToJSON(previewAttachInvoiceMode: PreviewAttachInvoiceMode): string;
/** @internal */
export declare const PreviewAttachProrationBehavior$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachProrationBehavior>;
/** @internal */
export declare const PreviewAttachRedirectMode$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachRedirectMode>;
/** @internal */
export type PreviewAttachAttachDiscount$Outbound = {
    reward_id?: string | undefined;
    promotion_code?: string | undefined;
};
/** @internal */
export declare const PreviewAttachAttachDiscount$outboundSchema: z.ZodMiniType<PreviewAttachAttachDiscount$Outbound, PreviewAttachAttachDiscount>;
export declare function previewAttachAttachDiscountToJSON(previewAttachAttachDiscount: PreviewAttachAttachDiscount): string;
/** @internal */
export declare const PreviewAttachPlanSchedule$outboundSchema: z.ZodMiniEnum<typeof PreviewAttachPlanSchedule>;
/** @internal */
export type PreviewAttachCustomLineItem$Outbound = {
    amount: number;
    description: string;
};
/** @internal */
export declare const PreviewAttachCustomLineItem$outboundSchema: z.ZodMiniType<PreviewAttachCustomLineItem$Outbound, PreviewAttachCustomLineItem>;
export declare function previewAttachCustomLineItemToJSON(previewAttachCustomLineItem: PreviewAttachCustomLineItem): string;
/** @internal */
export type PreviewAttachCarryOverBalances$Outbound = {
    enabled: boolean;
    feature_ids?: Array<string> | undefined;
};
/** @internal */
export declare const PreviewAttachCarryOverBalances$outboundSchema: z.ZodMiniType<PreviewAttachCarryOverBalances$Outbound, PreviewAttachCarryOverBalances>;
export declare function previewAttachCarryOverBalancesToJSON(previewAttachCarryOverBalances: PreviewAttachCarryOverBalances): string;
/** @internal */
export type PreviewAttachCarryOverUsages$Outbound = {
    enabled: boolean;
    feature_ids?: Array<string> | undefined;
};
/** @internal */
export declare const PreviewAttachCarryOverUsages$outboundSchema: z.ZodMiniType<PreviewAttachCarryOverUsages$Outbound, PreviewAttachCarryOverUsages>;
export declare function previewAttachCarryOverUsagesToJSON(previewAttachCarryOverUsages: PreviewAttachCarryOverUsages): string;
/** @internal */
export type PreviewAttachParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plan_id: string;
    feature_quantities?: Array<PreviewAttachFeatureQuantityRequest$Outbound> | undefined;
    version?: number | undefined;
    customize?: PreviewAttachCustomize$Outbound | undefined;
    invoice_mode?: PreviewAttachInvoiceMode$Outbound | undefined;
    proration_behavior?: string | undefined;
    redirect_mode: string;
    subscription_id?: string | undefined;
    discounts?: Array<PreviewAttachAttachDiscount$Outbound> | undefined;
    success_url?: string | undefined;
    new_billing_subscription?: boolean | undefined;
    plan_schedule?: string | undefined;
    checkout_session_params?: {
        [k: string]: any;
    } | undefined;
    custom_line_items?: Array<PreviewAttachCustomLineItem$Outbound> | undefined;
    processor_subscription_id?: string | undefined;
    carry_over_balances?: PreviewAttachCarryOverBalances$Outbound | undefined;
    carry_over_usages?: PreviewAttachCarryOverUsages$Outbound | undefined;
};
/** @internal */
export declare const PreviewAttachParams$outboundSchema: z.ZodMiniType<PreviewAttachParams$Outbound, PreviewAttachParams>;
export declare function previewAttachParamsToJSON(previewAttachParams: PreviewAttachParams): string;
/** @internal */
export declare const PreviewAttachDiscount$inboundSchema: z.ZodMiniType<PreviewAttachDiscount, unknown>;
export declare function previewAttachDiscountFromJSON(jsonString: string): SafeParseResult<PreviewAttachDiscount, SDKValidationError>;
/** @internal */
export declare const PreviewAttachLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewAttachLineItemPeriod, unknown>;
export declare function previewAttachLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewAttachLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewAttachLineItem$inboundSchema: z.ZodMiniType<PreviewAttachLineItem, unknown>;
export declare function previewAttachLineItemFromJSON(jsonString: string): SafeParseResult<PreviewAttachLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewAttachNextCycleDiscount$inboundSchema: z.ZodMiniType<PreviewAttachNextCycleDiscount, unknown>;
export declare function previewAttachNextCycleDiscountFromJSON(jsonString: string): SafeParseResult<PreviewAttachNextCycleDiscount, SDKValidationError>;
/** @internal */
export declare const PreviewAttachNextCycleLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewAttachNextCycleLineItemPeriod, unknown>;
export declare function previewAttachNextCycleLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewAttachNextCycleLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewAttachNextCycleLineItem$inboundSchema: z.ZodMiniType<PreviewAttachNextCycleLineItem, unknown>;
export declare function previewAttachNextCycleLineItemFromJSON(jsonString: string): SafeParseResult<PreviewAttachNextCycleLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewAttachUsageLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewAttachUsageLineItemPeriod, unknown>;
export declare function previewAttachUsageLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewAttachUsageLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewAttachUsageLineItem$inboundSchema: z.ZodMiniType<PreviewAttachUsageLineItem, unknown>;
export declare function previewAttachUsageLineItemFromJSON(jsonString: string): SafeParseResult<PreviewAttachUsageLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewAttachNextCycle$inboundSchema: z.ZodMiniType<PreviewAttachNextCycle, unknown>;
export declare function previewAttachNextCycleFromJSON(jsonString: string): SafeParseResult<PreviewAttachNextCycle, SDKValidationError>;
/** @internal */
export declare const PreviewAttachIncomingFeatureQuantity$inboundSchema: z.ZodMiniType<PreviewAttachIncomingFeatureQuantity, unknown>;
export declare function previewAttachIncomingFeatureQuantityFromJSON(jsonString: string): SafeParseResult<PreviewAttachIncomingFeatureQuantity, SDKValidationError>;
/** @internal */
export declare const PreviewAttachIncoming$inboundSchema: z.ZodMiniType<PreviewAttachIncoming, unknown>;
export declare function previewAttachIncomingFromJSON(jsonString: string): SafeParseResult<PreviewAttachIncoming, SDKValidationError>;
/** @internal */
export declare const PreviewAttachOutgoingFeatureQuantity$inboundSchema: z.ZodMiniType<PreviewAttachOutgoingFeatureQuantity, unknown>;
export declare function previewAttachOutgoingFeatureQuantityFromJSON(jsonString: string): SafeParseResult<PreviewAttachOutgoingFeatureQuantity, SDKValidationError>;
/** @internal */
export declare const PreviewAttachOutgoing$inboundSchema: z.ZodMiniType<PreviewAttachOutgoing, unknown>;
export declare function previewAttachOutgoingFromJSON(jsonString: string): SafeParseResult<PreviewAttachOutgoing, SDKValidationError>;
/** @internal */
export declare const PreviewAttachResponse$inboundSchema: z.ZodMiniType<PreviewAttachResponse, unknown>;
export declare function previewAttachResponseFromJSON(jsonString: string): SafeParseResult<PreviewAttachResponse, SDKValidationError>;
