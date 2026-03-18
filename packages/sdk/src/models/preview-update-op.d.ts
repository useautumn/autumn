import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type PreviewUpdateGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type PreviewUpdateFeatureQuantityRequest = {
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
export declare const PreviewUpdatePriceInterval: {
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
export type PreviewUpdatePriceInterval = ClosedEnum<typeof PreviewUpdatePriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type PreviewUpdateBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: PreviewUpdatePriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const PreviewUpdateResetInterval: {
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
export type PreviewUpdateResetInterval = ClosedEnum<typeof PreviewUpdateResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type PreviewUpdateReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: PreviewUpdateResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type PreviewUpdateTo = number | string;
export type PreviewUpdateTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const PreviewUpdateTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type PreviewUpdateTierBehavior = ClosedEnum<typeof PreviewUpdateTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const PreviewUpdateItemPriceInterval: {
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
export type PreviewUpdateItemPriceInterval = ClosedEnum<typeof PreviewUpdateItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const PreviewUpdateBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type PreviewUpdateBillingMethod = ClosedEnum<typeof PreviewUpdateBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type PreviewUpdatePrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<PreviewUpdateTier> | undefined;
    tierBehavior?: PreviewUpdateTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: PreviewUpdateItemPriceInterval;
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
    billingMethod: PreviewUpdateBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const PreviewUpdateOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type PreviewUpdateOnIncrease = ClosedEnum<typeof PreviewUpdateOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const PreviewUpdateOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type PreviewUpdateOnDecrease = ClosedEnum<typeof PreviewUpdateOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type PreviewUpdateProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: PreviewUpdateOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: PreviewUpdateOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const PreviewUpdateExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type PreviewUpdateExpiryDurationType = ClosedEnum<typeof PreviewUpdateExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type PreviewUpdateRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: PreviewUpdateExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type PreviewUpdatePlanItem = {
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
    reset?: PreviewUpdateReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: PreviewUpdatePrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: PreviewUpdateProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: PreviewUpdateRollover | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const PreviewUpdateDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type PreviewUpdateDurationType = ClosedEnum<typeof PreviewUpdateDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type PreviewUpdateFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: PreviewUpdateDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Customize the plan to attach. Can override the price, items, free trial, or a combination.
 */
export type PreviewUpdateCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: PreviewUpdateBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<PreviewUpdatePlanItem> | undefined;
    /**
     * Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely.
     */
    freeTrial?: PreviewUpdateFreeTrialParams | null | undefined;
};
/**
 * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
 */
export type PreviewUpdateInvoiceMode = {
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
export declare const PreviewUpdateProrationBehavior: {
    readonly ProrateImmediately: "prorate_immediately";
    readonly None: "none";
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export type PreviewUpdateProrationBehavior = ClosedEnum<typeof PreviewUpdateProrationBehavior>;
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export declare const PreviewUpdateRedirectMode: {
    readonly Always: "always";
    readonly IfRequired: "if_required";
    readonly Never: "never";
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export type PreviewUpdateRedirectMode = ClosedEnum<typeof PreviewUpdateRedirectMode>;
/**
 * Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.
 */
export declare const PreviewUpdateCancelAction: {
    readonly CancelImmediately: "cancel_immediately";
    readonly CancelEndOfCycle: "cancel_end_of_cycle";
    readonly Uncancel: "uncancel";
};
/**
 * Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.
 */
export type PreviewUpdateCancelAction = ClosedEnum<typeof PreviewUpdateCancelAction>;
export type PreviewUpdateParams = {
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
    featureQuantities?: Array<PreviewUpdateFeatureQuantityRequest> | undefined;
    /**
     * The version of the plan to attach.
     */
    version?: number | undefined;
    /**
     * Customize the plan to attach. Can override the price, items, free trial, or a combination.
     */
    customize?: PreviewUpdateCustomize | undefined;
    /**
     * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
     */
    invoiceMode?: PreviewUpdateInvoiceMode | undefined;
    /**
     * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
     */
    prorationBehavior?: PreviewUpdateProrationBehavior | undefined;
    /**
     * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
     */
    redirectMode?: PreviewUpdateRedirectMode | undefined;
    /**
     * A unique ID to identify this subscription. Can be used to target specific subscriptions in update operations when a customer has multiple products with the same plan.
     */
    subscriptionId?: string | undefined;
    /**
     * Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.
     */
    cancelAction?: PreviewUpdateCancelAction | undefined;
    /**
     * If true, the subscription is updated internally without applying billing changes in Stripe.
     */
    noBillingChanges?: boolean | undefined;
};
export type PreviewUpdateDiscount = {
    amountOff: number;
    percentOff?: number | undefined;
    rewardId?: string | undefined;
    rewardName?: string | undefined;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewUpdateLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewUpdateLineItem = {
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
    discounts?: Array<PreviewUpdateDiscount> | undefined;
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
    period?: PreviewUpdateLineItemPeriod | undefined;
    /**
     * The quantity of the line item.
     */
    quantity: number;
};
export type PreviewUpdateNextCycleDiscount = {
    amountOff: number;
    percentOff?: number | undefined;
    rewardId?: string | undefined;
    rewardName?: string | undefined;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewUpdateNextCycleLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewUpdateNextCycleLineItem = {
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
    discounts?: Array<PreviewUpdateNextCycleDiscount> | undefined;
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
    period?: PreviewUpdateNextCycleLineItemPeriod | undefined;
    /**
     * The quantity of the line item.
     */
    quantity: number;
};
/**
 * The period of time that this line item is being charged for.
 */
export type PreviewUpdateUsageLineItemPeriod = {
    /**
     * The start of the period in milliseconds since the Unix epoch.
     */
    start: number;
    /**
     * The end of the period in milliseconds since the Unix epoch.
     */
    end: number;
};
export type PreviewUpdateUsageLineItem = {
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
    period?: PreviewUpdateUsageLineItemPeriod | undefined;
};
/**
 * Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.
 */
export type PreviewUpdateNextCycle = {
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
    lineItems: Array<PreviewUpdateNextCycleLineItem>;
    /**
     * List of line items for usage-based features in the next cycle.
     */
    usageLineItems: Array<PreviewUpdateUsageLineItem>;
};
export type PreviewUpdateIncomingFeatureQuantity = {
    /**
     * The ID of the adjustable feature included in this change.
     */
    featureId: string;
    /**
     * The quantity that will apply for this feature in the change.
     */
    quantity: number;
};
export type PreviewUpdateIncoming = {
    /**
     * The ID of the plan affected by this preview change.
     */
    planId: string;
    plan?: Plan | undefined;
    /**
     * The feature quantity selections associated with this plan change.
     */
    featureQuantities: Array<PreviewUpdateIncomingFeatureQuantity>;
    /**
     * When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.
     */
    effectiveAt: number | null;
};
export type PreviewUpdateOutgoingFeatureQuantity = {
    /**
     * The ID of the adjustable feature included in this change.
     */
    featureId: string;
    /**
     * The quantity that will apply for this feature in the change.
     */
    quantity: number;
};
export type PreviewUpdateOutgoing = {
    /**
     * The ID of the plan affected by this preview change.
     */
    planId: string;
    plan?: Plan | undefined;
    /**
     * The feature quantity selections associated with this plan change.
     */
    featureQuantities: Array<PreviewUpdateOutgoingFeatureQuantity>;
    /**
     * When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.
     */
    effectiveAt: number | null;
};
export declare const Intent: {
    readonly UpdatePlan: "update_plan";
    readonly UpdateQuantity: "update_quantity";
    readonly CancelImmediately: "cancel_immediately";
    readonly CancelEndOfCycle: "cancel_end_of_cycle";
    readonly Uncancel: "uncancel";
    readonly None: "none";
};
export type Intent = OpenEnum<typeof Intent>;
/**
 * OK
 */
export type PreviewUpdateResponse = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * List of line items for the current billing period.
     */
    lineItems: Array<PreviewUpdateLineItem>;
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
    nextCycle?: PreviewUpdateNextCycle | undefined;
    /**
     * Expand the response with additional data.
     */
    expand?: Array<string> | undefined;
    /**
     * Products or subscription changes being added or updated.
     */
    incoming: Array<PreviewUpdateIncoming>;
    /**
     * Products or subscription changes being removed or ended.
     */
    outgoing: Array<PreviewUpdateOutgoing>;
    intent: Intent;
};
/** @internal */
export type PreviewUpdateFeatureQuantityRequest$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const PreviewUpdateFeatureQuantityRequest$outboundSchema: z.ZodMiniType<PreviewUpdateFeatureQuantityRequest$Outbound, PreviewUpdateFeatureQuantityRequest>;
export declare function previewUpdateFeatureQuantityRequestToJSON(previewUpdateFeatureQuantityRequest: PreviewUpdateFeatureQuantityRequest): string;
/** @internal */
export declare const PreviewUpdatePriceInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdatePriceInterval>;
/** @internal */
export type PreviewUpdateBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const PreviewUpdateBasePrice$outboundSchema: z.ZodMiniType<PreviewUpdateBasePrice$Outbound, PreviewUpdateBasePrice>;
export declare function previewUpdateBasePriceToJSON(previewUpdateBasePrice: PreviewUpdateBasePrice): string;
/** @internal */
export declare const PreviewUpdateResetInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateResetInterval>;
/** @internal */
export type PreviewUpdateReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const PreviewUpdateReset$outboundSchema: z.ZodMiniType<PreviewUpdateReset$Outbound, PreviewUpdateReset>;
export declare function previewUpdateResetToJSON(previewUpdateReset: PreviewUpdateReset): string;
/** @internal */
export type PreviewUpdateTo$Outbound = number | string;
/** @internal */
export declare const PreviewUpdateTo$outboundSchema: z.ZodMiniType<PreviewUpdateTo$Outbound, PreviewUpdateTo>;
export declare function previewUpdateToToJSON(previewUpdateTo: PreviewUpdateTo): string;
/** @internal */
export type PreviewUpdateTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const PreviewUpdateTier$outboundSchema: z.ZodMiniType<PreviewUpdateTier$Outbound, PreviewUpdateTier>;
export declare function previewUpdateTierToJSON(previewUpdateTier: PreviewUpdateTier): string;
/** @internal */
export declare const PreviewUpdateTierBehavior$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateTierBehavior>;
/** @internal */
export declare const PreviewUpdateItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateItemPriceInterval>;
/** @internal */
export declare const PreviewUpdateBillingMethod$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateBillingMethod>;
/** @internal */
export type PreviewUpdatePrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<PreviewUpdateTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const PreviewUpdatePrice$outboundSchema: z.ZodMiniType<PreviewUpdatePrice$Outbound, PreviewUpdatePrice>;
export declare function previewUpdatePriceToJSON(previewUpdatePrice: PreviewUpdatePrice): string;
/** @internal */
export declare const PreviewUpdateOnIncrease$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateOnIncrease>;
/** @internal */
export declare const PreviewUpdateOnDecrease$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateOnDecrease>;
/** @internal */
export type PreviewUpdateProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const PreviewUpdateProration$outboundSchema: z.ZodMiniType<PreviewUpdateProration$Outbound, PreviewUpdateProration>;
export declare function previewUpdateProrationToJSON(previewUpdateProration: PreviewUpdateProration): string;
/** @internal */
export declare const PreviewUpdateExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateExpiryDurationType>;
/** @internal */
export type PreviewUpdateRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const PreviewUpdateRollover$outboundSchema: z.ZodMiniType<PreviewUpdateRollover$Outbound, PreviewUpdateRollover>;
export declare function previewUpdateRolloverToJSON(previewUpdateRollover: PreviewUpdateRollover): string;
/** @internal */
export type PreviewUpdatePlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: PreviewUpdateReset$Outbound | undefined;
    price?: PreviewUpdatePrice$Outbound | undefined;
    proration?: PreviewUpdateProration$Outbound | undefined;
    rollover?: PreviewUpdateRollover$Outbound | undefined;
};
/** @internal */
export declare const PreviewUpdatePlanItem$outboundSchema: z.ZodMiniType<PreviewUpdatePlanItem$Outbound, PreviewUpdatePlanItem>;
export declare function previewUpdatePlanItemToJSON(previewUpdatePlanItem: PreviewUpdatePlanItem): string;
/** @internal */
export declare const PreviewUpdateDurationType$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateDurationType>;
/** @internal */
export type PreviewUpdateFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const PreviewUpdateFreeTrialParams$outboundSchema: z.ZodMiniType<PreviewUpdateFreeTrialParams$Outbound, PreviewUpdateFreeTrialParams>;
export declare function previewUpdateFreeTrialParamsToJSON(previewUpdateFreeTrialParams: PreviewUpdateFreeTrialParams): string;
/** @internal */
export type PreviewUpdateCustomize$Outbound = {
    price?: PreviewUpdateBasePrice$Outbound | null | undefined;
    items?: Array<PreviewUpdatePlanItem$Outbound> | undefined;
    free_trial?: PreviewUpdateFreeTrialParams$Outbound | null | undefined;
};
/** @internal */
export declare const PreviewUpdateCustomize$outboundSchema: z.ZodMiniType<PreviewUpdateCustomize$Outbound, PreviewUpdateCustomize>;
export declare function previewUpdateCustomizeToJSON(previewUpdateCustomize: PreviewUpdateCustomize): string;
/** @internal */
export type PreviewUpdateInvoiceMode$Outbound = {
    enabled: boolean;
    enable_plan_immediately: boolean;
    finalize: boolean;
};
/** @internal */
export declare const PreviewUpdateInvoiceMode$outboundSchema: z.ZodMiniType<PreviewUpdateInvoiceMode$Outbound, PreviewUpdateInvoiceMode>;
export declare function previewUpdateInvoiceModeToJSON(previewUpdateInvoiceMode: PreviewUpdateInvoiceMode): string;
/** @internal */
export declare const PreviewUpdateProrationBehavior$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateProrationBehavior>;
/** @internal */
export declare const PreviewUpdateRedirectMode$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateRedirectMode>;
/** @internal */
export declare const PreviewUpdateCancelAction$outboundSchema: z.ZodMiniEnum<typeof PreviewUpdateCancelAction>;
/** @internal */
export type PreviewUpdateParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plan_id?: string | undefined;
    feature_quantities?: Array<PreviewUpdateFeatureQuantityRequest$Outbound> | undefined;
    version?: number | undefined;
    customize?: PreviewUpdateCustomize$Outbound | undefined;
    invoice_mode?: PreviewUpdateInvoiceMode$Outbound | undefined;
    proration_behavior?: string | undefined;
    redirect_mode: string;
    subscription_id?: string | undefined;
    cancel_action?: string | undefined;
    no_billing_changes?: boolean | undefined;
};
/** @internal */
export declare const PreviewUpdateParams$outboundSchema: z.ZodMiniType<PreviewUpdateParams$Outbound, PreviewUpdateParams>;
export declare function previewUpdateParamsToJSON(previewUpdateParams: PreviewUpdateParams): string;
/** @internal */
export declare const PreviewUpdateDiscount$inboundSchema: z.ZodMiniType<PreviewUpdateDiscount, unknown>;
export declare function previewUpdateDiscountFromJSON(jsonString: string): SafeParseResult<PreviewUpdateDiscount, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewUpdateLineItemPeriod, unknown>;
export declare function previewUpdateLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewUpdateLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateLineItem$inboundSchema: z.ZodMiniType<PreviewUpdateLineItem, unknown>;
export declare function previewUpdateLineItemFromJSON(jsonString: string): SafeParseResult<PreviewUpdateLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateNextCycleDiscount$inboundSchema: z.ZodMiniType<PreviewUpdateNextCycleDiscount, unknown>;
export declare function previewUpdateNextCycleDiscountFromJSON(jsonString: string): SafeParseResult<PreviewUpdateNextCycleDiscount, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateNextCycleLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewUpdateNextCycleLineItemPeriod, unknown>;
export declare function previewUpdateNextCycleLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewUpdateNextCycleLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateNextCycleLineItem$inboundSchema: z.ZodMiniType<PreviewUpdateNextCycleLineItem, unknown>;
export declare function previewUpdateNextCycleLineItemFromJSON(jsonString: string): SafeParseResult<PreviewUpdateNextCycleLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateUsageLineItemPeriod$inboundSchema: z.ZodMiniType<PreviewUpdateUsageLineItemPeriod, unknown>;
export declare function previewUpdateUsageLineItemPeriodFromJSON(jsonString: string): SafeParseResult<PreviewUpdateUsageLineItemPeriod, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateUsageLineItem$inboundSchema: z.ZodMiniType<PreviewUpdateUsageLineItem, unknown>;
export declare function previewUpdateUsageLineItemFromJSON(jsonString: string): SafeParseResult<PreviewUpdateUsageLineItem, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateNextCycle$inboundSchema: z.ZodMiniType<PreviewUpdateNextCycle, unknown>;
export declare function previewUpdateNextCycleFromJSON(jsonString: string): SafeParseResult<PreviewUpdateNextCycle, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateIncomingFeatureQuantity$inboundSchema: z.ZodMiniType<PreviewUpdateIncomingFeatureQuantity, unknown>;
export declare function previewUpdateIncomingFeatureQuantityFromJSON(jsonString: string): SafeParseResult<PreviewUpdateIncomingFeatureQuantity, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateIncoming$inboundSchema: z.ZodMiniType<PreviewUpdateIncoming, unknown>;
export declare function previewUpdateIncomingFromJSON(jsonString: string): SafeParseResult<PreviewUpdateIncoming, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateOutgoingFeatureQuantity$inboundSchema: z.ZodMiniType<PreviewUpdateOutgoingFeatureQuantity, unknown>;
export declare function previewUpdateOutgoingFeatureQuantityFromJSON(jsonString: string): SafeParseResult<PreviewUpdateOutgoingFeatureQuantity, SDKValidationError>;
/** @internal */
export declare const PreviewUpdateOutgoing$inboundSchema: z.ZodMiniType<PreviewUpdateOutgoing, unknown>;
export declare function previewUpdateOutgoingFromJSON(jsonString: string): SafeParseResult<PreviewUpdateOutgoing, SDKValidationError>;
/** @internal */
export declare const Intent$inboundSchema: z.ZodMiniType<Intent, unknown>;
/** @internal */
export declare const PreviewUpdateResponse$inboundSchema: z.ZodMiniType<PreviewUpdateResponse, unknown>;
export declare function previewUpdateResponseFromJSON(jsonString: string): SafeParseResult<PreviewUpdateResponse, SDKValidationError>;
