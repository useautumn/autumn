import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type SetupPaymentGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type SetupPaymentFeatureQuantity = {
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
export declare const SetupPaymentPriceInterval: {
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
export type SetupPaymentPriceInterval = ClosedEnum<typeof SetupPaymentPriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type SetupPaymentBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: SetupPaymentPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const SetupPaymentResetInterval: {
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
export type SetupPaymentResetInterval = ClosedEnum<typeof SetupPaymentResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type SetupPaymentReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: SetupPaymentResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type SetupPaymentTo = number | string;
export type SetupPaymentTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const SetupPaymentTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type SetupPaymentTierBehavior = ClosedEnum<typeof SetupPaymentTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const SetupPaymentItemPriceInterval: {
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
export type SetupPaymentItemPriceInterval = ClosedEnum<typeof SetupPaymentItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const SetupPaymentBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type SetupPaymentBillingMethod = ClosedEnum<typeof SetupPaymentBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type SetupPaymentPrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<SetupPaymentTier> | undefined;
    tierBehavior?: SetupPaymentTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: SetupPaymentItemPriceInterval;
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
    billingMethod: SetupPaymentBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const SetupPaymentOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type SetupPaymentOnIncrease = ClosedEnum<typeof SetupPaymentOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const SetupPaymentOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type SetupPaymentOnDecrease = ClosedEnum<typeof SetupPaymentOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type SetupPaymentProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: SetupPaymentOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: SetupPaymentOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const SetupPaymentExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type SetupPaymentExpiryDurationType = ClosedEnum<typeof SetupPaymentExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type SetupPaymentRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: SetupPaymentExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type SetupPaymentPlanItem = {
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
    reset?: SetupPaymentReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: SetupPaymentPrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: SetupPaymentProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: SetupPaymentRollover | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const SetupPaymentDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type SetupPaymentDurationType = ClosedEnum<typeof SetupPaymentDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type SetupPaymentFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: SetupPaymentDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Customize the plan to attach. Can override the price, items, free trial, or a combination.
 */
export type SetupPaymentCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: SetupPaymentBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<SetupPaymentPlanItem> | undefined;
    /**
     * Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely.
     */
    freeTrial?: SetupPaymentFreeTrialParams | null | undefined;
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export declare const SetupPaymentProrationBehavior: {
    readonly ProrateImmediately: "prorate_immediately";
    readonly None: "none";
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export type SetupPaymentProrationBehavior = ClosedEnum<typeof SetupPaymentProrationBehavior>;
/**
 * A discount to apply. Can be either a reward ID or a promotion code.
 */
export type SetupPaymentAttachDiscount = {
    /**
     * The ID of the reward to apply as a discount.
     */
    rewardId?: string | undefined;
    /**
     * The promotion code to apply as a discount.
     */
    promotionCode?: string | undefined;
};
export type SetupPaymentCustomLineItem = {
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
export type SetupPaymentCarryOverBalances = {
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
export type SetupPaymentCarryOverUsages = {
    /**
     * Whether to carry over usages from the previous plan.
     */
    enabled: boolean;
    /**
     * The IDs of the features to carry over usages for. If left undefined, all consumable features will be carried over.
     */
    featureIds?: Array<string> | undefined;
};
export type SetupPaymentParams = {
    /**
     * The ID of the customer to attach the plan to.
     */
    customerId: string;
    /**
     * The ID of the entity to attach the plan to.
     */
    entityId?: string | undefined;
    /**
     * If specified, the plan will be attached to the customer after setup.
     */
    planId?: string | undefined;
    /**
     * If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan.
     */
    featureQuantities?: Array<SetupPaymentFeatureQuantity> | undefined;
    /**
     * The version of the plan to attach.
     */
    version?: number | undefined;
    /**
     * Customize the plan to attach. Can override the price, items, free trial, or a combination.
     */
    customize?: SetupPaymentCustomize | undefined;
    /**
     * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
     */
    prorationBehavior?: SetupPaymentProrationBehavior | undefined;
    /**
     * A unique ID to identify this subscription. Can be used to target specific subscriptions in update operations when a customer has multiple products with the same plan.
     */
    subscriptionId?: string | undefined;
    /**
     * List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.
     */
    discounts?: Array<SetupPaymentAttachDiscount> | undefined;
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
     * Custom line items that override the auto-generated proration invoice. Only valid for immediate plan changes (eg. upgrades or one off plans).
     */
    customLineItems?: Array<SetupPaymentCustomLineItem> | undefined;
    /**
     * The processor subscription ID to link. Use this to attach an existing Stripe subscription instead of creating a new one.
     */
    processorSubscriptionId?: string | undefined;
    /**
     * Whether to carry over balances from the previous plan.
     */
    carryOverBalances?: SetupPaymentCarryOverBalances | undefined;
    /**
     * Whether to carry over usages from the previous plan.
     */
    carryOverUsages?: SetupPaymentCarryOverUsages | undefined;
};
/**
 * OK
 */
export type SetupPaymentResponse = {
    /**
     * The ID of the customer
     */
    customerId: string;
    /**
     * The ID of the entity the plan (if specified) will be attached to after setup.
     */
    entityId?: string | undefined;
    /**
     * URL to redirect the customer to setup their payment.
     */
    url: string;
};
/** @internal */
export type SetupPaymentFeatureQuantity$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const SetupPaymentFeatureQuantity$outboundSchema: z.ZodMiniType<SetupPaymentFeatureQuantity$Outbound, SetupPaymentFeatureQuantity>;
export declare function setupPaymentFeatureQuantityToJSON(setupPaymentFeatureQuantity: SetupPaymentFeatureQuantity): string;
/** @internal */
export declare const SetupPaymentPriceInterval$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentPriceInterval>;
/** @internal */
export type SetupPaymentBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const SetupPaymentBasePrice$outboundSchema: z.ZodMiniType<SetupPaymentBasePrice$Outbound, SetupPaymentBasePrice>;
export declare function setupPaymentBasePriceToJSON(setupPaymentBasePrice: SetupPaymentBasePrice): string;
/** @internal */
export declare const SetupPaymentResetInterval$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentResetInterval>;
/** @internal */
export type SetupPaymentReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const SetupPaymentReset$outboundSchema: z.ZodMiniType<SetupPaymentReset$Outbound, SetupPaymentReset>;
export declare function setupPaymentResetToJSON(setupPaymentReset: SetupPaymentReset): string;
/** @internal */
export type SetupPaymentTo$Outbound = number | string;
/** @internal */
export declare const SetupPaymentTo$outboundSchema: z.ZodMiniType<SetupPaymentTo$Outbound, SetupPaymentTo>;
export declare function setupPaymentToToJSON(setupPaymentTo: SetupPaymentTo): string;
/** @internal */
export type SetupPaymentTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const SetupPaymentTier$outboundSchema: z.ZodMiniType<SetupPaymentTier$Outbound, SetupPaymentTier>;
export declare function setupPaymentTierToJSON(setupPaymentTier: SetupPaymentTier): string;
/** @internal */
export declare const SetupPaymentTierBehavior$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentTierBehavior>;
/** @internal */
export declare const SetupPaymentItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentItemPriceInterval>;
/** @internal */
export declare const SetupPaymentBillingMethod$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentBillingMethod>;
/** @internal */
export type SetupPaymentPrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<SetupPaymentTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const SetupPaymentPrice$outboundSchema: z.ZodMiniType<SetupPaymentPrice$Outbound, SetupPaymentPrice>;
export declare function setupPaymentPriceToJSON(setupPaymentPrice: SetupPaymentPrice): string;
/** @internal */
export declare const SetupPaymentOnIncrease$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentOnIncrease>;
/** @internal */
export declare const SetupPaymentOnDecrease$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentOnDecrease>;
/** @internal */
export type SetupPaymentProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const SetupPaymentProration$outboundSchema: z.ZodMiniType<SetupPaymentProration$Outbound, SetupPaymentProration>;
export declare function setupPaymentProrationToJSON(setupPaymentProration: SetupPaymentProration): string;
/** @internal */
export declare const SetupPaymentExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentExpiryDurationType>;
/** @internal */
export type SetupPaymentRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const SetupPaymentRollover$outboundSchema: z.ZodMiniType<SetupPaymentRollover$Outbound, SetupPaymentRollover>;
export declare function setupPaymentRolloverToJSON(setupPaymentRollover: SetupPaymentRollover): string;
/** @internal */
export type SetupPaymentPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: SetupPaymentReset$Outbound | undefined;
    price?: SetupPaymentPrice$Outbound | undefined;
    proration?: SetupPaymentProration$Outbound | undefined;
    rollover?: SetupPaymentRollover$Outbound | undefined;
};
/** @internal */
export declare const SetupPaymentPlanItem$outboundSchema: z.ZodMiniType<SetupPaymentPlanItem$Outbound, SetupPaymentPlanItem>;
export declare function setupPaymentPlanItemToJSON(setupPaymentPlanItem: SetupPaymentPlanItem): string;
/** @internal */
export declare const SetupPaymentDurationType$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentDurationType>;
/** @internal */
export type SetupPaymentFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const SetupPaymentFreeTrialParams$outboundSchema: z.ZodMiniType<SetupPaymentFreeTrialParams$Outbound, SetupPaymentFreeTrialParams>;
export declare function setupPaymentFreeTrialParamsToJSON(setupPaymentFreeTrialParams: SetupPaymentFreeTrialParams): string;
/** @internal */
export type SetupPaymentCustomize$Outbound = {
    price?: SetupPaymentBasePrice$Outbound | null | undefined;
    items?: Array<SetupPaymentPlanItem$Outbound> | undefined;
    free_trial?: SetupPaymentFreeTrialParams$Outbound | null | undefined;
};
/** @internal */
export declare const SetupPaymentCustomize$outboundSchema: z.ZodMiniType<SetupPaymentCustomize$Outbound, SetupPaymentCustomize>;
export declare function setupPaymentCustomizeToJSON(setupPaymentCustomize: SetupPaymentCustomize): string;
/** @internal */
export declare const SetupPaymentProrationBehavior$outboundSchema: z.ZodMiniEnum<typeof SetupPaymentProrationBehavior>;
/** @internal */
export type SetupPaymentAttachDiscount$Outbound = {
    reward_id?: string | undefined;
    promotion_code?: string | undefined;
};
/** @internal */
export declare const SetupPaymentAttachDiscount$outboundSchema: z.ZodMiniType<SetupPaymentAttachDiscount$Outbound, SetupPaymentAttachDiscount>;
export declare function setupPaymentAttachDiscountToJSON(setupPaymentAttachDiscount: SetupPaymentAttachDiscount): string;
/** @internal */
export type SetupPaymentCustomLineItem$Outbound = {
    amount: number;
    description: string;
};
/** @internal */
export declare const SetupPaymentCustomLineItem$outboundSchema: z.ZodMiniType<SetupPaymentCustomLineItem$Outbound, SetupPaymentCustomLineItem>;
export declare function setupPaymentCustomLineItemToJSON(setupPaymentCustomLineItem: SetupPaymentCustomLineItem): string;
/** @internal */
export type SetupPaymentCarryOverBalances$Outbound = {
    enabled: boolean;
    feature_ids?: Array<string> | undefined;
};
/** @internal */
export declare const SetupPaymentCarryOverBalances$outboundSchema: z.ZodMiniType<SetupPaymentCarryOverBalances$Outbound, SetupPaymentCarryOverBalances>;
export declare function setupPaymentCarryOverBalancesToJSON(setupPaymentCarryOverBalances: SetupPaymentCarryOverBalances): string;
/** @internal */
export type SetupPaymentCarryOverUsages$Outbound = {
    enabled: boolean;
    feature_ids?: Array<string> | undefined;
};
/** @internal */
export declare const SetupPaymentCarryOverUsages$outboundSchema: z.ZodMiniType<SetupPaymentCarryOverUsages$Outbound, SetupPaymentCarryOverUsages>;
export declare function setupPaymentCarryOverUsagesToJSON(setupPaymentCarryOverUsages: SetupPaymentCarryOverUsages): string;
/** @internal */
export type SetupPaymentParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plan_id?: string | undefined;
    feature_quantities?: Array<SetupPaymentFeatureQuantity$Outbound> | undefined;
    version?: number | undefined;
    customize?: SetupPaymentCustomize$Outbound | undefined;
    proration_behavior?: string | undefined;
    subscription_id?: string | undefined;
    discounts?: Array<SetupPaymentAttachDiscount$Outbound> | undefined;
    success_url?: string | undefined;
    checkout_session_params?: {
        [k: string]: any;
    } | undefined;
    custom_line_items?: Array<SetupPaymentCustomLineItem$Outbound> | undefined;
    processor_subscription_id?: string | undefined;
    carry_over_balances?: SetupPaymentCarryOverBalances$Outbound | undefined;
    carry_over_usages?: SetupPaymentCarryOverUsages$Outbound | undefined;
};
/** @internal */
export declare const SetupPaymentParams$outboundSchema: z.ZodMiniType<SetupPaymentParams$Outbound, SetupPaymentParams>;
export declare function setupPaymentParamsToJSON(setupPaymentParams: SetupPaymentParams): string;
/** @internal */
export declare const SetupPaymentResponse$inboundSchema: z.ZodMiniType<SetupPaymentResponse, unknown>;
export declare function setupPaymentResponseFromJSON(jsonString: string): SafeParseResult<SetupPaymentResponse, SDKValidationError>;
