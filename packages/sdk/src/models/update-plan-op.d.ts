import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type UpdatePlanGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const UpdatePlanPriceIntervalRequest: {
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
export type UpdatePlanPriceIntervalRequest = ClosedEnum<typeof UpdatePlanPriceIntervalRequest>;
/**
 * Base price configuration for a plan.
 */
export type UpdatePlanBasePrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: UpdatePlanPriceIntervalRequest;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const UpdatePlanResetIntervalRequest: {
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
export type UpdatePlanResetIntervalRequest = ClosedEnum<typeof UpdatePlanResetIntervalRequest>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type UpdatePlanResetRequest = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: UpdatePlanResetIntervalRequest;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type UpdatePlanTo = number | string;
export type UpdatePlanTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const UpdatePlanTierBehaviorRequest: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type UpdatePlanTierBehaviorRequest = ClosedEnum<typeof UpdatePlanTierBehaviorRequest>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const UpdatePlanItemPriceIntervalRequest: {
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
export type UpdatePlanItemPriceIntervalRequest = ClosedEnum<typeof UpdatePlanItemPriceIntervalRequest>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const UpdatePlanBillingMethodRequest: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type UpdatePlanBillingMethodRequest = ClosedEnum<typeof UpdatePlanBillingMethodRequest>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type UpdatePlanPriceRequest = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<UpdatePlanTier> | undefined;
    tierBehavior?: UpdatePlanTierBehaviorRequest | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: UpdatePlanItemPriceIntervalRequest;
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
    billingMethod: UpdatePlanBillingMethodRequest;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const UpdatePlanOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type UpdatePlanOnIncrease = ClosedEnum<typeof UpdatePlanOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const UpdatePlanOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type UpdatePlanOnDecrease = ClosedEnum<typeof UpdatePlanOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type UpdatePlanProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: UpdatePlanOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: UpdatePlanOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const UpdatePlanExpiryDurationTypeRequest: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type UpdatePlanExpiryDurationTypeRequest = ClosedEnum<typeof UpdatePlanExpiryDurationTypeRequest>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type UpdatePlanRolloverRequest = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: UpdatePlanExpiryDurationTypeRequest;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type UpdatePlanPlanItem = {
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
    reset?: UpdatePlanResetRequest | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: UpdatePlanPriceRequest | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: UpdatePlanProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: UpdatePlanRolloverRequest | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const UpdatePlanDurationTypeRequest: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type UpdatePlanDurationTypeRequest = ClosedEnum<typeof UpdatePlanDurationTypeRequest>;
/**
 * Free trial configuration for a plan.
 */
export type UpdatePlanFreeTrialParams = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: UpdatePlanDurationTypeRequest | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
export type UpdatePlanParams = {
    /**
     * The ID of the plan to update.
     */
    planId: string;
    /**
     * Group identifier for organizing related plans. Plans in the same group are mutually exclusive.
     */
    group?: string | undefined;
    /**
     * Display name of the plan.
     */
    name?: string | undefined;
    description?: string | undefined;
    /**
     * Whether the plan is an add-on.
     */
    addOn?: boolean | undefined;
    /**
     * Whether the plan is automatically enabled.
     */
    autoEnable?: boolean | undefined;
    /**
     * The price of the plan. Set to null to remove the base price.
     */
    price?: UpdatePlanBasePrice | null | undefined;
    /**
     * Feature configurations for this plan. Each item defines included units, pricing, and reset behavior.
     */
    items?: Array<UpdatePlanPlanItem> | undefined;
    /**
     * The free trial of the plan. Set to null to remove the free trial.
     */
    freeTrial?: UpdatePlanFreeTrialParams | null | undefined;
    version?: number | undefined;
    archived?: boolean | undefined;
    /**
     * The new ID to use for the plan. Can only be updated if the plan has not been used by any customers.
     */
    newPlanId?: string | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const UpdatePlanPriceIntervalResponse: {
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
export type UpdatePlanPriceIntervalResponse = OpenEnum<typeof UpdatePlanPriceIntervalResponse>;
/**
 * Display text for showing this price in pricing pages.
 */
export type UpdatePlanPriceDisplay = {
    /**
     * Main display text (e.g. '$10' or '100 messages').
     */
    primaryText: string;
    /**
     * Secondary display text (e.g. 'per month' or 'then $0.5 per 100').
     */
    secondaryText?: string | undefined;
};
export type UpdatePlanPriceResponse = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: UpdatePlanPriceIntervalResponse;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Display text for showing this price in pricing pages.
     */
    display?: UpdatePlanPriceDisplay | undefined;
};
/**
 * The type of the feature
 */
export declare const UpdatePlanType: {
    readonly Static: "static";
    readonly Boolean: "boolean";
    readonly SingleUse: "single_use";
    readonly ContinuousUse: "continuous_use";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature
 */
export type UpdatePlanType = OpenEnum<typeof UpdatePlanType>;
export type UpdatePlanFeatureDisplay = {
    /**
     * The singular display name for the feature.
     */
    singular: string;
    /**
     * The plural display name for the feature.
     */
    plural: string;
};
export type UpdatePlanCreditSchema = {
    /**
     * The ID of the metered feature (should be a single_use feature).
     */
    meteredFeatureId: string;
    /**
     * The credit cost of the metered feature.
     */
    creditCost: number;
};
/**
 * The full feature object if expanded.
 */
export type UpdatePlanFeature = {
    /**
     * The ID of the feature, used to refer to it in other API calls like /track or /check.
     */
    id: string;
    /**
     * The name of the feature.
     */
    name?: string | null | undefined;
    /**
     * The type of the feature
     */
    type: UpdatePlanType;
    /**
     * Singular and plural display names for the feature.
     */
    display?: UpdatePlanFeatureDisplay | null | undefined;
    /**
     * Credit cost schema for credit system features.
     */
    creditSchema?: Array<UpdatePlanCreditSchema> | null | undefined;
    /**
     * Whether or not the feature is archived.
     */
    archived?: boolean | null | undefined;
};
/**
 * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
 */
export declare const UpdatePlanResetIntervalResponse: {
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
 * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
 */
export type UpdatePlanResetIntervalResponse = OpenEnum<typeof UpdatePlanResetIntervalResponse>;
export type UpdatePlanResetResponse = {
    /**
     * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
     */
    interval: UpdatePlanResetIntervalResponse;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export declare const UpdatePlanTierBehaviorResponse: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type UpdatePlanTierBehaviorResponse = OpenEnum<typeof UpdatePlanTierBehaviorResponse>;
/**
 * Billing interval for this price. For consumable features, should match reset.interval.
 */
export declare const UpdatePlanPriceItemIntervalResponse: {
    readonly OneOff: "one_off";
    readonly Week: "week";
    readonly Month: "month";
    readonly Quarter: "quarter";
    readonly SemiAnnual: "semi_annual";
    readonly Year: "year";
};
/**
 * Billing interval for this price. For consumable features, should match reset.interval.
 */
export type UpdatePlanPriceItemIntervalResponse = OpenEnum<typeof UpdatePlanPriceItemIntervalResponse>;
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export declare const UpdatePlanBillingMethodResponse: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export type UpdatePlanBillingMethodResponse = OpenEnum<typeof UpdatePlanBillingMethodResponse>;
export type UpdatePlanItemPriceResponse = {
    /**
     * Price per billing_units after included usage is consumed. Mutually exclusive with tiers.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing configuration. Each tier's 'to' INCLUDES the included amount. Either 'tiers' or 'amount' is required.
     */
    tiers?: Array<any | null> | undefined;
    tierBehavior?: UpdatePlanTierBehaviorResponse | undefined;
    /**
     * Billing interval for this price. For consumable features, should match reset.interval.
     */
    interval: UpdatePlanPriceItemIntervalResponse;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Number of units per price increment. Usage is rounded UP to the nearest billing_units when billed (e.g. billing_units=100 means 101 usage rounds to 200).
     */
    billingUnits: number;
    /**
     * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
     */
    billingMethod: UpdatePlanBillingMethodResponse;
    /**
     * Maximum units a customer can purchase beyond included. E.g. if included=100 and max_purchase=300, customer can use up to 400 total before usage is capped. Null for no limit.
     */
    maxPurchase: number | null;
};
/**
 * Display text for showing this item in pricing pages.
 */
export type UpdatePlanItemDisplay = {
    /**
     * Main display text (e.g. '$10' or '100 messages').
     */
    primaryText: string;
    /**
     * Secondary display text (e.g. 'per month' or 'then $0.5 per 100').
     */
    secondaryText?: string | undefined;
};
/**
 * When rolled over units expire.
 */
export declare const UpdatePlanExpiryDurationTypeResponse: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type UpdatePlanExpiryDurationTypeResponse = OpenEnum<typeof UpdatePlanExpiryDurationTypeResponse>;
/**
 * Rollover configuration for unused units. If set, unused included units roll over to the next period.
 */
export type UpdatePlanRolloverResponse = {
    /**
     * Maximum rollover units. Null for unlimited rollover.
     */
    max: number | null;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: UpdatePlanExpiryDurationTypeResponse;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
export type UpdatePlanItem = {
    /**
     * The ID of the feature this item configures.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: UpdatePlanFeature | undefined;
    /**
     * Number of free units included. For consumable features, balance resets to this number each interval.
     */
    included: number;
    /**
     * Whether the customer has unlimited access to this feature.
     */
    unlimited: boolean;
    /**
     * Reset configuration for consumable features. Null for non-consumable features like seats where usage persists across billing cycles.
     */
    reset: UpdatePlanResetResponse | null;
    /**
     * Pricing configuration for usage beyond included units. Null if feature is entirely free.
     */
    price: UpdatePlanItemPriceResponse | null;
    /**
     * Display text for showing this item in pricing pages.
     */
    display?: UpdatePlanItemDisplay | undefined;
    /**
     * Rollover configuration for unused units. If set, unused included units roll over to the next period.
     */
    rollover?: UpdatePlanRolloverResponse | undefined;
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export declare const UpdatePlanDurationTypeResponse: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export type UpdatePlanDurationTypeResponse = OpenEnum<typeof UpdatePlanDurationTypeResponse>;
/**
 * Free trial configuration. If set, new customers can try this plan before being charged.
 */
export type UpdatePlanFreeTrial = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial duration ('day', 'month', 'year').
     */
    durationType: UpdatePlanDurationTypeResponse;
    /**
     * Whether a payment method is required to start the trial. If true, customer will be charged after trial ends.
     */
    cardRequired: boolean;
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export declare const UpdatePlanEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export type UpdatePlanEnv = OpenEnum<typeof UpdatePlanEnv>;
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export declare const UpdatePlanStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export type UpdatePlanStatus = OpenEnum<typeof UpdatePlanStatus>;
/**
 * The action that would occur if this plan were attached to the customer.
 */
export declare const UpdatePlanAttachAction: {
    readonly Activate: "activate";
    readonly Upgrade: "upgrade";
    readonly Downgrade: "downgrade";
    readonly None: "none";
    readonly Purchase: "purchase";
};
/**
 * The action that would occur if this plan were attached to the customer.
 */
export type UpdatePlanAttachAction = OpenEnum<typeof UpdatePlanAttachAction>;
export type UpdatePlanCustomerEligibility = {
    /**
     * Whether the trial on this plan is available to this customer. For example, if the customer used the trial in the past, this will be false.
     */
    trialAvailable?: boolean | undefined;
    /**
     * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
     */
    status?: UpdatePlanStatus | undefined;
    /**
     * Whether the customer's active instance of this plan is set to cancel.
     */
    canceling?: boolean | undefined;
    /**
     * Whether the customer is currently on a free trial of this plan.
     */
    trialing?: boolean | undefined;
    /**
     * The action that would occur if this plan were attached to the customer.
     */
    attachAction: UpdatePlanAttachAction;
};
/**
 * A plan defines a set of features, pricing, and entitlements that can be attached to customers.
 */
export type UpdatePlanResponse = {
    /**
     * Unique identifier for the plan.
     */
    id: string;
    /**
     * Display name of the plan.
     */
    name: string;
    /**
     * Optional description of the plan.
     */
    description: string | null;
    /**
     * Group identifier for organizing related plans. Plans in the same group are mutually exclusive.
     */
    group: string | null;
    /**
     * Version number of the plan. Incremented when plan configuration changes.
     */
    version: number;
    /**
     * Whether this is an add-on plan that can be attached alongside a main plan.
     */
    addOn: boolean;
    /**
     * If true, this plan is automatically attached when a customer is created. Used for free plans.
     */
    autoEnable: boolean;
    /**
     * Base recurring price for the plan. Null for free plans or usage-only plans.
     */
    price: UpdatePlanPriceResponse | null;
    /**
     * Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature.
     */
    items: Array<UpdatePlanItem>;
    /**
     * Free trial configuration. If set, new customers can try this plan before being charged.
     */
    freeTrial?: UpdatePlanFreeTrial | undefined;
    /**
     * Unix timestamp (ms) when the plan was created.
     */
    createdAt: number;
    /**
     * Environment this plan belongs to ('sandbox' or 'live').
     */
    env: UpdatePlanEnv;
    /**
     * Whether the plan is archived. Archived plans cannot be attached to new customers.
     */
    archived: boolean;
    /**
     * If this is a variant, the ID of the base plan it was created from.
     */
    baseVariantId: string | null;
    customerEligibility?: UpdatePlanCustomerEligibility | undefined;
};
/** @internal */
export declare const UpdatePlanPriceIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanPriceIntervalRequest>;
/** @internal */
export type UpdatePlanBasePrice$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const UpdatePlanBasePrice$outboundSchema: z.ZodMiniType<UpdatePlanBasePrice$Outbound, UpdatePlanBasePrice>;
export declare function updatePlanBasePriceToJSON(updatePlanBasePrice: UpdatePlanBasePrice): string;
/** @internal */
export declare const UpdatePlanResetIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanResetIntervalRequest>;
/** @internal */
export type UpdatePlanResetRequest$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const UpdatePlanResetRequest$outboundSchema: z.ZodMiniType<UpdatePlanResetRequest$Outbound, UpdatePlanResetRequest>;
export declare function updatePlanResetRequestToJSON(updatePlanResetRequest: UpdatePlanResetRequest): string;
/** @internal */
export type UpdatePlanTo$Outbound = number | string;
/** @internal */
export declare const UpdatePlanTo$outboundSchema: z.ZodMiniType<UpdatePlanTo$Outbound, UpdatePlanTo>;
export declare function updatePlanToToJSON(updatePlanTo: UpdatePlanTo): string;
/** @internal */
export type UpdatePlanTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const UpdatePlanTier$outboundSchema: z.ZodMiniType<UpdatePlanTier$Outbound, UpdatePlanTier>;
export declare function updatePlanTierToJSON(updatePlanTier: UpdatePlanTier): string;
/** @internal */
export declare const UpdatePlanTierBehaviorRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanTierBehaviorRequest>;
/** @internal */
export declare const UpdatePlanItemPriceIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanItemPriceIntervalRequest>;
/** @internal */
export declare const UpdatePlanBillingMethodRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanBillingMethodRequest>;
/** @internal */
export type UpdatePlanPriceRequest$Outbound = {
    amount?: number | undefined;
    tiers?: Array<UpdatePlanTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const UpdatePlanPriceRequest$outboundSchema: z.ZodMiniType<UpdatePlanPriceRequest$Outbound, UpdatePlanPriceRequest>;
export declare function updatePlanPriceRequestToJSON(updatePlanPriceRequest: UpdatePlanPriceRequest): string;
/** @internal */
export declare const UpdatePlanOnIncrease$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanOnIncrease>;
/** @internal */
export declare const UpdatePlanOnDecrease$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanOnDecrease>;
/** @internal */
export type UpdatePlanProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const UpdatePlanProration$outboundSchema: z.ZodMiniType<UpdatePlanProration$Outbound, UpdatePlanProration>;
export declare function updatePlanProrationToJSON(updatePlanProration: UpdatePlanProration): string;
/** @internal */
export declare const UpdatePlanExpiryDurationTypeRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanExpiryDurationTypeRequest>;
/** @internal */
export type UpdatePlanRolloverRequest$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const UpdatePlanRolloverRequest$outboundSchema: z.ZodMiniType<UpdatePlanRolloverRequest$Outbound, UpdatePlanRolloverRequest>;
export declare function updatePlanRolloverRequestToJSON(updatePlanRolloverRequest: UpdatePlanRolloverRequest): string;
/** @internal */
export type UpdatePlanPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: UpdatePlanResetRequest$Outbound | undefined;
    price?: UpdatePlanPriceRequest$Outbound | undefined;
    proration?: UpdatePlanProration$Outbound | undefined;
    rollover?: UpdatePlanRolloverRequest$Outbound | undefined;
};
/** @internal */
export declare const UpdatePlanPlanItem$outboundSchema: z.ZodMiniType<UpdatePlanPlanItem$Outbound, UpdatePlanPlanItem>;
export declare function updatePlanPlanItemToJSON(updatePlanPlanItem: UpdatePlanPlanItem): string;
/** @internal */
export declare const UpdatePlanDurationTypeRequest$outboundSchema: z.ZodMiniEnum<typeof UpdatePlanDurationTypeRequest>;
/** @internal */
export type UpdatePlanFreeTrialParams$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const UpdatePlanFreeTrialParams$outboundSchema: z.ZodMiniType<UpdatePlanFreeTrialParams$Outbound, UpdatePlanFreeTrialParams>;
export declare function updatePlanFreeTrialParamsToJSON(updatePlanFreeTrialParams: UpdatePlanFreeTrialParams): string;
/** @internal */
export type UpdatePlanParams$Outbound = {
    plan_id: string;
    group: string;
    name?: string | undefined;
    description?: string | undefined;
    add_on?: boolean | undefined;
    auto_enable?: boolean | undefined;
    price?: UpdatePlanBasePrice$Outbound | null | undefined;
    items?: Array<UpdatePlanPlanItem$Outbound> | undefined;
    free_trial?: UpdatePlanFreeTrialParams$Outbound | null | undefined;
    version?: number | undefined;
    archived: boolean;
    new_plan_id?: string | undefined;
};
/** @internal */
export declare const UpdatePlanParams$outboundSchema: z.ZodMiniType<UpdatePlanParams$Outbound, UpdatePlanParams>;
export declare function updatePlanParamsToJSON(updatePlanParams: UpdatePlanParams): string;
/** @internal */
export declare const UpdatePlanPriceIntervalResponse$inboundSchema: z.ZodMiniType<UpdatePlanPriceIntervalResponse, unknown>;
/** @internal */
export declare const UpdatePlanPriceDisplay$inboundSchema: z.ZodMiniType<UpdatePlanPriceDisplay, unknown>;
export declare function updatePlanPriceDisplayFromJSON(jsonString: string): SafeParseResult<UpdatePlanPriceDisplay, SDKValidationError>;
/** @internal */
export declare const UpdatePlanPriceResponse$inboundSchema: z.ZodMiniType<UpdatePlanPriceResponse, unknown>;
export declare function updatePlanPriceResponseFromJSON(jsonString: string): SafeParseResult<UpdatePlanPriceResponse, SDKValidationError>;
/** @internal */
export declare const UpdatePlanType$inboundSchema: z.ZodMiniType<UpdatePlanType, unknown>;
/** @internal */
export declare const UpdatePlanFeatureDisplay$inboundSchema: z.ZodMiniType<UpdatePlanFeatureDisplay, unknown>;
export declare function updatePlanFeatureDisplayFromJSON(jsonString: string): SafeParseResult<UpdatePlanFeatureDisplay, SDKValidationError>;
/** @internal */
export declare const UpdatePlanCreditSchema$inboundSchema: z.ZodMiniType<UpdatePlanCreditSchema, unknown>;
export declare function updatePlanCreditSchemaFromJSON(jsonString: string): SafeParseResult<UpdatePlanCreditSchema, SDKValidationError>;
/** @internal */
export declare const UpdatePlanFeature$inboundSchema: z.ZodMiniType<UpdatePlanFeature, unknown>;
export declare function updatePlanFeatureFromJSON(jsonString: string): SafeParseResult<UpdatePlanFeature, SDKValidationError>;
/** @internal */
export declare const UpdatePlanResetIntervalResponse$inboundSchema: z.ZodMiniType<UpdatePlanResetIntervalResponse, unknown>;
/** @internal */
export declare const UpdatePlanResetResponse$inboundSchema: z.ZodMiniType<UpdatePlanResetResponse, unknown>;
export declare function updatePlanResetResponseFromJSON(jsonString: string): SafeParseResult<UpdatePlanResetResponse, SDKValidationError>;
/** @internal */
export declare const UpdatePlanTierBehaviorResponse$inboundSchema: z.ZodMiniType<UpdatePlanTierBehaviorResponse, unknown>;
/** @internal */
export declare const UpdatePlanPriceItemIntervalResponse$inboundSchema: z.ZodMiniType<UpdatePlanPriceItemIntervalResponse, unknown>;
/** @internal */
export declare const UpdatePlanBillingMethodResponse$inboundSchema: z.ZodMiniType<UpdatePlanBillingMethodResponse, unknown>;
/** @internal */
export declare const UpdatePlanItemPriceResponse$inboundSchema: z.ZodMiniType<UpdatePlanItemPriceResponse, unknown>;
export declare function updatePlanItemPriceResponseFromJSON(jsonString: string): SafeParseResult<UpdatePlanItemPriceResponse, SDKValidationError>;
/** @internal */
export declare const UpdatePlanItemDisplay$inboundSchema: z.ZodMiniType<UpdatePlanItemDisplay, unknown>;
export declare function updatePlanItemDisplayFromJSON(jsonString: string): SafeParseResult<UpdatePlanItemDisplay, SDKValidationError>;
/** @internal */
export declare const UpdatePlanExpiryDurationTypeResponse$inboundSchema: z.ZodMiniType<UpdatePlanExpiryDurationTypeResponse, unknown>;
/** @internal */
export declare const UpdatePlanRolloverResponse$inboundSchema: z.ZodMiniType<UpdatePlanRolloverResponse, unknown>;
export declare function updatePlanRolloverResponseFromJSON(jsonString: string): SafeParseResult<UpdatePlanRolloverResponse, SDKValidationError>;
/** @internal */
export declare const UpdatePlanItem$inboundSchema: z.ZodMiniType<UpdatePlanItem, unknown>;
export declare function updatePlanItemFromJSON(jsonString: string): SafeParseResult<UpdatePlanItem, SDKValidationError>;
/** @internal */
export declare const UpdatePlanDurationTypeResponse$inboundSchema: z.ZodMiniType<UpdatePlanDurationTypeResponse, unknown>;
/** @internal */
export declare const UpdatePlanFreeTrial$inboundSchema: z.ZodMiniType<UpdatePlanFreeTrial, unknown>;
export declare function updatePlanFreeTrialFromJSON(jsonString: string): SafeParseResult<UpdatePlanFreeTrial, SDKValidationError>;
/** @internal */
export declare const UpdatePlanEnv$inboundSchema: z.ZodMiniType<UpdatePlanEnv, unknown>;
/** @internal */
export declare const UpdatePlanStatus$inboundSchema: z.ZodMiniType<UpdatePlanStatus, unknown>;
/** @internal */
export declare const UpdatePlanAttachAction$inboundSchema: z.ZodMiniType<UpdatePlanAttachAction, unknown>;
/** @internal */
export declare const UpdatePlanCustomerEligibility$inboundSchema: z.ZodMiniType<UpdatePlanCustomerEligibility, unknown>;
export declare function updatePlanCustomerEligibilityFromJSON(jsonString: string): SafeParseResult<UpdatePlanCustomerEligibility, SDKValidationError>;
/** @internal */
export declare const UpdatePlanResponse$inboundSchema: z.ZodMiniType<UpdatePlanResponse, unknown>;
export declare function updatePlanResponseFromJSON(jsonString: string): SafeParseResult<UpdatePlanResponse, SDKValidationError>;
