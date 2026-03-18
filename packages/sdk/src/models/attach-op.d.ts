import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type AttachGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Quantity configuration for a prepaid feature.
 */
export type AttachFeatureQuantity = {
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
export declare const AttachPriceInterval: {
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
export type AttachPriceInterval = ClosedEnum<typeof AttachPriceInterval>;
/**
 * Base price configuration for a plan.
 */
export type AttachBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: AttachPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const AttachResetInterval: {
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
export type AttachResetInterval = ClosedEnum<typeof AttachResetInterval>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type AttachReset = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: AttachResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type AttachTo = number | string;
export type AttachTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const AttachTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type AttachTierBehavior = ClosedEnum<typeof AttachTierBehavior>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const AttachItemPriceInterval: {
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
export type AttachItemPriceInterval = ClosedEnum<typeof AttachItemPriceInterval>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const AttachBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type AttachBillingMethod = ClosedEnum<typeof AttachBillingMethod>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type AttachPrice = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<AttachTier> | undefined;
    tierBehavior?: AttachTierBehavior | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: AttachItemPriceInterval;
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
    billingMethod: AttachBillingMethod;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const AttachOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type AttachOnIncrease = ClosedEnum<typeof AttachOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const AttachOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type AttachOnDecrease = ClosedEnum<typeof AttachOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type AttachProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: AttachOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: AttachOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const AttachExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type AttachExpiryDurationType = ClosedEnum<typeof AttachExpiryDurationType>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type AttachRollover = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: AttachExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type AttachPlanItem = {
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
    reset?: AttachReset | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: AttachPrice | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: AttachProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: AttachRollover | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const AttachDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type AttachDurationType = ClosedEnum<typeof AttachDurationType>;
/**
 * Free trial configuration for a plan.
 */
export type AttachFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: AttachDurationType | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
/**
 * Customize the plan to attach. Can override the price, items, free trial, or a combination.
 */
export type AttachCustomize = {
    /**
     * Override the base price of the plan. Pass null to remove the base price.
     */
    price?: AttachBasePrice | null | undefined;
    /**
     * Override the items in the plan.
     */
    items?: Array<AttachPlanItem> | undefined;
    /**
     * Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely.
     */
    freeTrial?: AttachFreeTrialParams | null | undefined;
};
/**
 * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
 */
export type AttachInvoiceMode = {
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
export declare const AttachProrationBehavior: {
    readonly ProrateImmediately: "prorate_immediately";
    readonly None: "none";
};
/**
 * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
 */
export type AttachProrationBehavior = ClosedEnum<typeof AttachProrationBehavior>;
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export declare const AttachRedirectMode: {
    readonly Always: "always";
    readonly IfRequired: "if_required";
    readonly Never: "never";
};
/**
 * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
 */
export type AttachRedirectMode = ClosedEnum<typeof AttachRedirectMode>;
/**
 * A discount to apply. Can be either a reward ID or a promotion code.
 */
export type AttachAttachDiscount = {
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
export declare const AttachPlanSchedule: {
    readonly Immediate: "immediate";
    readonly EndOfCycle: "end_of_cycle";
};
/**
 * When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.
 */
export type AttachPlanSchedule = ClosedEnum<typeof AttachPlanSchedule>;
export type AttachCustomLineItem = {
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
export type AttachCarryOverBalances = {
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
export type AttachCarryOverUsages = {
    /**
     * Whether to carry over usages from the previous plan.
     */
    enabled: boolean;
    /**
     * The IDs of the features to carry over usages for. If left undefined, all consumable features will be carried over.
     */
    featureIds?: Array<string> | undefined;
};
export type AttachParams = {
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
    featureQuantities?: Array<AttachFeatureQuantity> | undefined;
    /**
     * The version of the plan to attach.
     */
    version?: number | undefined;
    /**
     * Customize the plan to attach. Can override the price, items, free trial, or a combination.
     */
    customize?: AttachCustomize | undefined;
    /**
     * Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.
     */
    invoiceMode?: AttachInvoiceMode | undefined;
    /**
     * How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.
     */
    prorationBehavior?: AttachProrationBehavior | undefined;
    /**
     * Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.
     */
    redirectMode?: AttachRedirectMode | undefined;
    /**
     * A unique ID to identify this subscription. Can be used to target specific subscriptions in update operations when a customer has multiple products with the same plan.
     */
    subscriptionId?: string | undefined;
    /**
     * List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.
     */
    discounts?: Array<AttachAttachDiscount> | undefined;
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
    planSchedule?: AttachPlanSchedule | undefined;
    /**
     * Additional parameters to pass into the creation of the Stripe checkout session.
     */
    checkoutSessionParams?: {
        [k: string]: any;
    } | undefined;
    /**
     * Custom line items that override the auto-generated proration invoice. Only valid for immediate plan changes (eg. upgrades or one off plans).
     */
    customLineItems?: Array<AttachCustomLineItem> | undefined;
    /**
     * The processor subscription ID to link. Use this to attach an existing Stripe subscription instead of creating a new one.
     */
    processorSubscriptionId?: string | undefined;
    /**
     * Whether to carry over balances from the previous plan.
     */
    carryOverBalances?: AttachCarryOverBalances | undefined;
    /**
     * Whether to carry over usages from the previous plan.
     */
    carryOverUsages?: AttachCarryOverUsages | undefined;
};
/**
 * Invoice details if an invoice was created. Only present when a charge was made.
 */
export type AttachInvoice = {
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
export declare const AttachCode: {
    readonly ThreedsRequired: "3ds_required";
    readonly PaymentMethodRequired: "payment_method_required";
    readonly PaymentFailed: "payment_failed";
};
/**
 * The type of action required to complete the payment.
 */
export type AttachCode = OpenEnum<typeof AttachCode>;
/**
 * Details about any action required to complete the payment. Present when the payment could not be processed automatically.
 */
export type AttachRequiredAction = {
    /**
     * The type of action required to complete the payment.
     */
    code: AttachCode;
    /**
     * A human-readable explanation of why this action is required.
     */
    reason: string;
};
/**
 * OK
 */
export type AttachResponse = {
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
    invoice?: AttachInvoice | undefined;
    /**
     * URL to redirect the customer to complete payment. Null if no payment action is required.
     */
    paymentUrl: string | null;
    /**
     * Details about any action required to complete the payment. Present when the payment could not be processed automatically.
     */
    requiredAction?: AttachRequiredAction | undefined;
};
/** @internal */
export type AttachFeatureQuantity$Outbound = {
    feature_id: string;
    quantity?: number | undefined;
    adjustable?: boolean | undefined;
};
/** @internal */
export declare const AttachFeatureQuantity$outboundSchema: z.ZodMiniType<AttachFeatureQuantity$Outbound, AttachFeatureQuantity>;
export declare function attachFeatureQuantityToJSON(attachFeatureQuantity: AttachFeatureQuantity): string;
/** @internal */
export declare const AttachPriceInterval$outboundSchema: z.ZodMiniEnum<typeof AttachPriceInterval>;
/** @internal */
export type AttachBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const AttachBasePrice$outboundSchema: z.ZodMiniType<AttachBasePrice$Outbound, AttachBasePrice>;
export declare function attachBasePriceToJSON(attachBasePrice: AttachBasePrice): string;
/** @internal */
export declare const AttachResetInterval$outboundSchema: z.ZodMiniEnum<typeof AttachResetInterval>;
/** @internal */
export type AttachReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const AttachReset$outboundSchema: z.ZodMiniType<AttachReset$Outbound, AttachReset>;
export declare function attachResetToJSON(attachReset: AttachReset): string;
/** @internal */
export type AttachTo$Outbound = number | string;
/** @internal */
export declare const AttachTo$outboundSchema: z.ZodMiniType<AttachTo$Outbound, AttachTo>;
export declare function attachToToJSON(attachTo: AttachTo): string;
/** @internal */
export type AttachTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const AttachTier$outboundSchema: z.ZodMiniType<AttachTier$Outbound, AttachTier>;
export declare function attachTierToJSON(attachTier: AttachTier): string;
/** @internal */
export declare const AttachTierBehavior$outboundSchema: z.ZodMiniEnum<typeof AttachTierBehavior>;
/** @internal */
export declare const AttachItemPriceInterval$outboundSchema: z.ZodMiniEnum<typeof AttachItemPriceInterval>;
/** @internal */
export declare const AttachBillingMethod$outboundSchema: z.ZodMiniEnum<typeof AttachBillingMethod>;
/** @internal */
export type AttachPrice$Outbound = {
    amount?: number | undefined;
    tiers?: Array<AttachTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const AttachPrice$outboundSchema: z.ZodMiniType<AttachPrice$Outbound, AttachPrice>;
export declare function attachPriceToJSON(attachPrice: AttachPrice): string;
/** @internal */
export declare const AttachOnIncrease$outboundSchema: z.ZodMiniEnum<typeof AttachOnIncrease>;
/** @internal */
export declare const AttachOnDecrease$outboundSchema: z.ZodMiniEnum<typeof AttachOnDecrease>;
/** @internal */
export type AttachProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const AttachProration$outboundSchema: z.ZodMiniType<AttachProration$Outbound, AttachProration>;
export declare function attachProrationToJSON(attachProration: AttachProration): string;
/** @internal */
export declare const AttachExpiryDurationType$outboundSchema: z.ZodMiniEnum<typeof AttachExpiryDurationType>;
/** @internal */
export type AttachRollover$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const AttachRollover$outboundSchema: z.ZodMiniType<AttachRollover$Outbound, AttachRollover>;
export declare function attachRolloverToJSON(attachRollover: AttachRollover): string;
/** @internal */
export type AttachPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: AttachReset$Outbound | undefined;
    price?: AttachPrice$Outbound | undefined;
    proration?: AttachProration$Outbound | undefined;
    rollover?: AttachRollover$Outbound | undefined;
};
/** @internal */
export declare const AttachPlanItem$outboundSchema: z.ZodMiniType<AttachPlanItem$Outbound, AttachPlanItem>;
export declare function attachPlanItemToJSON(attachPlanItem: AttachPlanItem): string;
/** @internal */
export declare const AttachDurationType$outboundSchema: z.ZodMiniEnum<typeof AttachDurationType>;
/** @internal */
export type AttachFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const AttachFreeTrialParams$outboundSchema: z.ZodMiniType<AttachFreeTrialParams$Outbound, AttachFreeTrialParams>;
export declare function attachFreeTrialParamsToJSON(attachFreeTrialParams: AttachFreeTrialParams): string;
/** @internal */
export type AttachCustomize$Outbound = {
    price?: AttachBasePrice$Outbound | null | undefined;
    items?: Array<AttachPlanItem$Outbound> | undefined;
    free_trial?: AttachFreeTrialParams$Outbound | null | undefined;
};
/** @internal */
export declare const AttachCustomize$outboundSchema: z.ZodMiniType<AttachCustomize$Outbound, AttachCustomize>;
export declare function attachCustomizeToJSON(attachCustomize: AttachCustomize): string;
/** @internal */
export type AttachInvoiceMode$Outbound = {
    enabled: boolean;
    enable_plan_immediately: boolean;
    finalize: boolean;
};
/** @internal */
export declare const AttachInvoiceMode$outboundSchema: z.ZodMiniType<AttachInvoiceMode$Outbound, AttachInvoiceMode>;
export declare function attachInvoiceModeToJSON(attachInvoiceMode: AttachInvoiceMode): string;
/** @internal */
export declare const AttachProrationBehavior$outboundSchema: z.ZodMiniEnum<typeof AttachProrationBehavior>;
/** @internal */
export declare const AttachRedirectMode$outboundSchema: z.ZodMiniEnum<typeof AttachRedirectMode>;
/** @internal */
export type AttachAttachDiscount$Outbound = {
    reward_id?: string | undefined;
    promotion_code?: string | undefined;
};
/** @internal */
export declare const AttachAttachDiscount$outboundSchema: z.ZodMiniType<AttachAttachDiscount$Outbound, AttachAttachDiscount>;
export declare function attachAttachDiscountToJSON(attachAttachDiscount: AttachAttachDiscount): string;
/** @internal */
export declare const AttachPlanSchedule$outboundSchema: z.ZodMiniEnum<typeof AttachPlanSchedule>;
/** @internal */
export type AttachCustomLineItem$Outbound = {
    amount: number;
    description: string;
};
/** @internal */
export declare const AttachCustomLineItem$outboundSchema: z.ZodMiniType<AttachCustomLineItem$Outbound, AttachCustomLineItem>;
export declare function attachCustomLineItemToJSON(attachCustomLineItem: AttachCustomLineItem): string;
/** @internal */
export type AttachCarryOverBalances$Outbound = {
    enabled: boolean;
    feature_ids?: Array<string> | undefined;
};
/** @internal */
export declare const AttachCarryOverBalances$outboundSchema: z.ZodMiniType<AttachCarryOverBalances$Outbound, AttachCarryOverBalances>;
export declare function attachCarryOverBalancesToJSON(attachCarryOverBalances: AttachCarryOverBalances): string;
/** @internal */
export type AttachCarryOverUsages$Outbound = {
    enabled: boolean;
    feature_ids?: Array<string> | undefined;
};
/** @internal */
export declare const AttachCarryOverUsages$outboundSchema: z.ZodMiniType<AttachCarryOverUsages$Outbound, AttachCarryOverUsages>;
export declare function attachCarryOverUsagesToJSON(attachCarryOverUsages: AttachCarryOverUsages): string;
/** @internal */
export type AttachParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    plan_id: string;
    feature_quantities?: Array<AttachFeatureQuantity$Outbound> | undefined;
    version?: number | undefined;
    customize?: AttachCustomize$Outbound | undefined;
    invoice_mode?: AttachInvoiceMode$Outbound | undefined;
    proration_behavior?: string | undefined;
    redirect_mode: string;
    subscription_id?: string | undefined;
    discounts?: Array<AttachAttachDiscount$Outbound> | undefined;
    success_url?: string | undefined;
    new_billing_subscription?: boolean | undefined;
    plan_schedule?: string | undefined;
    checkout_session_params?: {
        [k: string]: any;
    } | undefined;
    custom_line_items?: Array<AttachCustomLineItem$Outbound> | undefined;
    processor_subscription_id?: string | undefined;
    carry_over_balances?: AttachCarryOverBalances$Outbound | undefined;
    carry_over_usages?: AttachCarryOverUsages$Outbound | undefined;
};
/** @internal */
export declare const AttachParams$outboundSchema: z.ZodMiniType<AttachParams$Outbound, AttachParams>;
export declare function attachParamsToJSON(attachParams: AttachParams): string;
/** @internal */
export declare const AttachInvoice$inboundSchema: z.ZodMiniType<AttachInvoice, unknown>;
export declare function attachInvoiceFromJSON(jsonString: string): SafeParseResult<AttachInvoice, SDKValidationError>;
/** @internal */
export declare const AttachCode$inboundSchema: z.ZodMiniType<AttachCode, unknown>;
/** @internal */
export declare const AttachRequiredAction$inboundSchema: z.ZodMiniType<AttachRequiredAction, unknown>;
export declare function attachRequiredActionFromJSON(jsonString: string): SafeParseResult<AttachRequiredAction, SDKValidationError>;
/** @internal */
export declare const AttachResponse$inboundSchema: z.ZodMiniType<AttachResponse, unknown>;
export declare function attachResponseFromJSON(jsonString: string): SafeParseResult<AttachResponse, SDKValidationError>;
