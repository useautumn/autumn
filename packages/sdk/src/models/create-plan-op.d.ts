import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type CreatePlanGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const CreatePlanPriceIntervalRequest: {
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
export type CreatePlanPriceIntervalRequest = ClosedEnum<typeof CreatePlanPriceIntervalRequest>;
/**
 * Base recurring price for the plan. Omit for free or usage-only plans.
 */
export type CreatePlanPriceRequest = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: CreatePlanPriceIntervalRequest;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
/**
 * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
 */
export declare const CreatePlanResetIntervalRequest: {
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
export type CreatePlanResetIntervalRequest = ClosedEnum<typeof CreatePlanResetIntervalRequest>;
/**
 * Reset configuration for consumable features. Omit for non-consumable features like seats.
 */
export type CreatePlanResetRequest = {
    /**
     * Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.
     */
    interval: CreatePlanResetIntervalRequest;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export type CreatePlanTo = number | string;
export type CreatePlanTier = {
    to: number | string;
    amount?: number | undefined;
    flatAmount?: number | undefined;
};
export declare const CreatePlanTierBehaviorRequest: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type CreatePlanTierBehaviorRequest = ClosedEnum<typeof CreatePlanTierBehaviorRequest>;
/**
 * Billing interval. For consumable features, should match reset.interval.
 */
export declare const CreatePlanItemPriceIntervalRequest: {
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
export type CreatePlanItemPriceIntervalRequest = ClosedEnum<typeof CreatePlanItemPriceIntervalRequest>;
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export declare const CreatePlanBillingMethodRequest: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.
 */
export type CreatePlanBillingMethodRequest = ClosedEnum<typeof CreatePlanBillingMethodRequest>;
/**
 * Pricing for usage beyond included units. Omit for free features.
 */
export type CreatePlanItemPriceRequest = {
    /**
     * Price per billing_units after included usage. Either 'amount' or 'tiers' is required.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing.  Either 'amount' or 'tiers' is required.
     */
    tiers?: Array<CreatePlanTier> | undefined;
    tierBehavior?: CreatePlanTierBehaviorRequest | undefined;
    /**
     * Billing interval. For consumable features, should match reset.interval.
     */
    interval: CreatePlanItemPriceIntervalRequest;
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
    billingMethod: CreatePlanBillingMethodRequest;
    /**
     * Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.
     */
    maxPurchase?: number | undefined;
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export declare const CreatePlanOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
/**
 * Billing behavior when quantity increases mid-cycle.
 */
export type CreatePlanOnIncrease = ClosedEnum<typeof CreatePlanOnIncrease>;
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export declare const CreatePlanOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
/**
 * Credit behavior when quantity decreases mid-cycle.
 */
export type CreatePlanOnDecrease = ClosedEnum<typeof CreatePlanOnDecrease>;
/**
 * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
 */
export type CreatePlanProration = {
    /**
     * Billing behavior when quantity increases mid-cycle.
     */
    onIncrease: CreatePlanOnIncrease;
    /**
     * Credit behavior when quantity decreases mid-cycle.
     */
    onDecrease: CreatePlanOnDecrease;
};
/**
 * When rolled over units expire.
 */
export declare const CreatePlanExpiryDurationTypeRequest: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type CreatePlanExpiryDurationTypeRequest = ClosedEnum<typeof CreatePlanExpiryDurationTypeRequest>;
/**
 * Rollover config for unused units. If set, unused included units carry over.
 */
export type CreatePlanRolloverRequest = {
    /**
     * Max rollover units. Omit for unlimited rollover.
     */
    max?: number | undefined;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: CreatePlanExpiryDurationTypeRequest;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
/**
 * Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.
 */
export type CreatePlanPlanItem = {
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
    reset?: CreatePlanResetRequest | undefined;
    /**
     * Pricing for usage beyond included units. Omit for free features.
     */
    price?: CreatePlanItemPriceRequest | undefined;
    /**
     * Proration settings for prepaid features. Controls mid-cycle quantity change billing.
     */
    proration?: CreatePlanProration | undefined;
    /**
     * Rollover config for unused units. If set, unused included units carry over.
     */
    rollover?: CreatePlanRolloverRequest | undefined;
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export declare const CreatePlanDurationTypeRequest: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial ('day', 'month', 'year').
 */
export type CreatePlanDurationTypeRequest = ClosedEnum<typeof CreatePlanDurationTypeRequest>;
/**
 * Free trial configuration. Customers can try this plan before being charged.
 */
export type FreeTrialRequest = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial ('day', 'month', 'year').
     */
    durationType?: CreatePlanDurationTypeRequest | undefined;
    /**
     * If true, payment method required to start trial. Customer is charged after trial ends.
     */
    cardRequired?: boolean | undefined;
};
export type CreatePlanParams = {
    /**
     * The ID of the plan to create.
     */
    planId: string;
    /**
     * Group identifier for organizing related plans. Plans in the same group are mutually exclusive.
     */
    group?: string | undefined;
    /**
     * Display name of the plan.
     */
    name: string;
    /**
     * Optional description of the plan.
     */
    description?: string | null | undefined;
    /**
     * If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group.
     */
    addOn?: boolean | undefined;
    /**
     * If true, plan is automatically attached when a customer is created. Use for free tiers.
     */
    autoEnable?: boolean | undefined;
    /**
     * Base recurring price for the plan. Omit for free or usage-only plans.
     */
    price?: CreatePlanPriceRequest | undefined;
    /**
     * Feature configurations for this plan. Each item defines included units, pricing, and reset behavior.
     */
    items?: Array<CreatePlanPlanItem> | undefined;
    /**
     * Free trial configuration. Customers can try this plan before being charged.
     */
    freeTrial?: FreeTrialRequest | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const CreatePlanPriceIntervalResponse: {
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
export type CreatePlanPriceIntervalResponse = OpenEnum<typeof CreatePlanPriceIntervalResponse>;
/**
 * Display text for showing this price in pricing pages.
 */
export type CreatePlanPriceDisplay = {
    /**
     * Main display text (e.g. '$10' or '100 messages').
     */
    primaryText: string;
    /**
     * Secondary display text (e.g. 'per month' or 'then $0.5 per 100').
     */
    secondaryText?: string | undefined;
};
export type CreatePlanPriceResponse = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: CreatePlanPriceIntervalResponse;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Display text for showing this price in pricing pages.
     */
    display?: CreatePlanPriceDisplay | undefined;
};
/**
 * The type of the feature
 */
export declare const CreatePlanType: {
    readonly Static: "static";
    readonly Boolean: "boolean";
    readonly SingleUse: "single_use";
    readonly ContinuousUse: "continuous_use";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature
 */
export type CreatePlanType = OpenEnum<typeof CreatePlanType>;
export type CreatePlanFeatureDisplay = {
    /**
     * The singular display name for the feature.
     */
    singular: string;
    /**
     * The plural display name for the feature.
     */
    plural: string;
};
export type CreatePlanCreditSchema = {
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
export type CreatePlanFeature = {
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
    type: CreatePlanType;
    /**
     * Singular and plural display names for the feature.
     */
    display?: CreatePlanFeatureDisplay | null | undefined;
    /**
     * Credit cost schema for credit system features.
     */
    creditSchema?: Array<CreatePlanCreditSchema> | null | undefined;
    /**
     * Whether or not the feature is archived.
     */
    archived?: boolean | null | undefined;
};
/**
 * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
 */
export declare const CreatePlanResetIntervalResponse: {
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
export type CreatePlanResetIntervalResponse = OpenEnum<typeof CreatePlanResetIntervalResponse>;
export type CreatePlanResetResponse = {
    /**
     * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
     */
    interval: CreatePlanResetIntervalResponse;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export declare const CreatePlanTierBehaviorResponse: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type CreatePlanTierBehaviorResponse = OpenEnum<typeof CreatePlanTierBehaviorResponse>;
/**
 * Billing interval for this price. For consumable features, should match reset.interval.
 */
export declare const CreatePlanPriceItemIntervalResponse: {
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
export type CreatePlanPriceItemIntervalResponse = OpenEnum<typeof CreatePlanPriceItemIntervalResponse>;
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export declare const CreatePlanBillingMethodResponse: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export type CreatePlanBillingMethodResponse = OpenEnum<typeof CreatePlanBillingMethodResponse>;
export type CreatePlanItemPriceResponse = {
    /**
     * Price per billing_units after included usage is consumed. Mutually exclusive with tiers.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing configuration. Each tier's 'to' INCLUDES the included amount. Either 'tiers' or 'amount' is required.
     */
    tiers?: Array<any | null> | undefined;
    tierBehavior?: CreatePlanTierBehaviorResponse | undefined;
    /**
     * Billing interval for this price. For consumable features, should match reset.interval.
     */
    interval: CreatePlanPriceItemIntervalResponse;
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
    billingMethod: CreatePlanBillingMethodResponse;
    /**
     * Maximum units a customer can purchase beyond included. E.g. if included=100 and max_purchase=300, customer can use up to 400 total before usage is capped. Null for no limit.
     */
    maxPurchase: number | null;
};
/**
 * Display text for showing this item in pricing pages.
 */
export type CreatePlanItemDisplay = {
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
export declare const CreatePlanExpiryDurationTypeResponse: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type CreatePlanExpiryDurationTypeResponse = OpenEnum<typeof CreatePlanExpiryDurationTypeResponse>;
/**
 * Rollover configuration for unused units. If set, unused included units roll over to the next period.
 */
export type CreatePlanRolloverResponse = {
    /**
     * Maximum rollover units. Null for unlimited rollover.
     */
    max: number | null;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: CreatePlanExpiryDurationTypeResponse;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
export type CreatePlanItem = {
    /**
     * The ID of the feature this item configures.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: CreatePlanFeature | undefined;
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
    reset: CreatePlanResetResponse | null;
    /**
     * Pricing configuration for usage beyond included units. Null if feature is entirely free.
     */
    price: CreatePlanItemPriceResponse | null;
    /**
     * Display text for showing this item in pricing pages.
     */
    display?: CreatePlanItemDisplay | undefined;
    /**
     * Rollover configuration for unused units. If set, unused included units roll over to the next period.
     */
    rollover?: CreatePlanRolloverResponse | undefined;
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export declare const CreatePlanDurationTypeResponse: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export type CreatePlanDurationTypeResponse = OpenEnum<typeof CreatePlanDurationTypeResponse>;
/**
 * Free trial configuration. If set, new customers can try this plan before being charged.
 */
export type CreatePlanFreeTrialResponse = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial duration ('day', 'month', 'year').
     */
    durationType: CreatePlanDurationTypeResponse;
    /**
     * Whether a payment method is required to start the trial. If true, customer will be charged after trial ends.
     */
    cardRequired: boolean;
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export declare const CreatePlanEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export type CreatePlanEnv = OpenEnum<typeof CreatePlanEnv>;
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export declare const CreatePlanStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export type CreatePlanStatus = OpenEnum<typeof CreatePlanStatus>;
/**
 * The action that would occur if this plan were attached to the customer.
 */
export declare const CreatePlanAttachAction: {
    readonly Activate: "activate";
    readonly Upgrade: "upgrade";
    readonly Downgrade: "downgrade";
    readonly None: "none";
    readonly Purchase: "purchase";
};
/**
 * The action that would occur if this plan were attached to the customer.
 */
export type CreatePlanAttachAction = OpenEnum<typeof CreatePlanAttachAction>;
export type CreatePlanCustomerEligibility = {
    /**
     * Whether the trial on this plan is available to this customer. For example, if the customer used the trial in the past, this will be false.
     */
    trialAvailable?: boolean | undefined;
    /**
     * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
     */
    status?: CreatePlanStatus | undefined;
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
    attachAction: CreatePlanAttachAction;
};
/**
 * A plan defines a set of features, pricing, and entitlements that can be attached to customers.
 */
export type CreatePlanResponse = {
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
    price: CreatePlanPriceResponse | null;
    /**
     * Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature.
     */
    items: Array<CreatePlanItem>;
    /**
     * Free trial configuration. If set, new customers can try this plan before being charged.
     */
    freeTrial?: CreatePlanFreeTrialResponse | undefined;
    /**
     * Unix timestamp (ms) when the plan was created.
     */
    createdAt: number;
    /**
     * Environment this plan belongs to ('sandbox' or 'live').
     */
    env: CreatePlanEnv;
    /**
     * Whether the plan is archived. Archived plans cannot be attached to new customers.
     */
    archived: boolean;
    /**
     * If this is a variant, the ID of the base plan it was created from.
     */
    baseVariantId: string | null;
    customerEligibility?: CreatePlanCustomerEligibility | undefined;
};
/** @internal */
export declare const CreatePlanPriceIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanPriceIntervalRequest>;
/** @internal */
export type CreatePlanPriceRequest$Outbound = {
    amount: number;
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const CreatePlanPriceRequest$outboundSchema: z.ZodMiniType<CreatePlanPriceRequest$Outbound, CreatePlanPriceRequest>;
export declare function createPlanPriceRequestToJSON(createPlanPriceRequest: CreatePlanPriceRequest): string;
/** @internal */
export declare const CreatePlanResetIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanResetIntervalRequest>;
/** @internal */
export type CreatePlanResetRequest$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const CreatePlanResetRequest$outboundSchema: z.ZodMiniType<CreatePlanResetRequest$Outbound, CreatePlanResetRequest>;
export declare function createPlanResetRequestToJSON(createPlanResetRequest: CreatePlanResetRequest): string;
/** @internal */
export type CreatePlanTo$Outbound = number | string;
/** @internal */
export declare const CreatePlanTo$outboundSchema: z.ZodMiniType<CreatePlanTo$Outbound, CreatePlanTo>;
export declare function createPlanToToJSON(createPlanTo: CreatePlanTo): string;
/** @internal */
export type CreatePlanTier$Outbound = {
    to: number | string;
    amount?: number | undefined;
    flat_amount?: number | undefined;
};
/** @internal */
export declare const CreatePlanTier$outboundSchema: z.ZodMiniType<CreatePlanTier$Outbound, CreatePlanTier>;
export declare function createPlanTierToJSON(createPlanTier: CreatePlanTier): string;
/** @internal */
export declare const CreatePlanTierBehaviorRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanTierBehaviorRequest>;
/** @internal */
export declare const CreatePlanItemPriceIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanItemPriceIntervalRequest>;
/** @internal */
export declare const CreatePlanBillingMethodRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanBillingMethodRequest>;
/** @internal */
export type CreatePlanItemPriceRequest$Outbound = {
    amount?: number | undefined;
    tiers?: Array<CreatePlanTier$Outbound> | undefined;
    tier_behavior?: string | undefined;
    interval: string;
    interval_count: number;
    billing_units: number;
    billing_method: string;
    max_purchase?: number | undefined;
};
/** @internal */
export declare const CreatePlanItemPriceRequest$outboundSchema: z.ZodMiniType<CreatePlanItemPriceRequest$Outbound, CreatePlanItemPriceRequest>;
export declare function createPlanItemPriceRequestToJSON(createPlanItemPriceRequest: CreatePlanItemPriceRequest): string;
/** @internal */
export declare const CreatePlanOnIncrease$outboundSchema: z.ZodMiniEnum<typeof CreatePlanOnIncrease>;
/** @internal */
export declare const CreatePlanOnDecrease$outboundSchema: z.ZodMiniEnum<typeof CreatePlanOnDecrease>;
/** @internal */
export type CreatePlanProration$Outbound = {
    on_increase: string;
    on_decrease: string;
};
/** @internal */
export declare const CreatePlanProration$outboundSchema: z.ZodMiniType<CreatePlanProration$Outbound, CreatePlanProration>;
export declare function createPlanProrationToJSON(createPlanProration: CreatePlanProration): string;
/** @internal */
export declare const CreatePlanExpiryDurationTypeRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanExpiryDurationTypeRequest>;
/** @internal */
export type CreatePlanRolloverRequest$Outbound = {
    max?: number | undefined;
    expiry_duration_type: string;
    expiry_duration_length?: number | undefined;
};
/** @internal */
export declare const CreatePlanRolloverRequest$outboundSchema: z.ZodMiniType<CreatePlanRolloverRequest$Outbound, CreatePlanRolloverRequest>;
export declare function createPlanRolloverRequestToJSON(createPlanRolloverRequest: CreatePlanRolloverRequest): string;
/** @internal */
export type CreatePlanPlanItem$Outbound = {
    feature_id: string;
    included?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: CreatePlanResetRequest$Outbound | undefined;
    price?: CreatePlanItemPriceRequest$Outbound | undefined;
    proration?: CreatePlanProration$Outbound | undefined;
    rollover?: CreatePlanRolloverRequest$Outbound | undefined;
};
/** @internal */
export declare const CreatePlanPlanItem$outboundSchema: z.ZodMiniType<CreatePlanPlanItem$Outbound, CreatePlanPlanItem>;
export declare function createPlanPlanItemToJSON(createPlanPlanItem: CreatePlanPlanItem): string;
/** @internal */
export declare const CreatePlanDurationTypeRequest$outboundSchema: z.ZodMiniEnum<typeof CreatePlanDurationTypeRequest>;
/** @internal */
export type FreeTrialRequest$Outbound = {
    duration_length: number;
    duration_type: string;
    card_required: boolean;
};
/** @internal */
export declare const FreeTrialRequest$outboundSchema: z.ZodMiniType<FreeTrialRequest$Outbound, FreeTrialRequest>;
export declare function freeTrialRequestToJSON(freeTrialRequest: FreeTrialRequest): string;
/** @internal */
export type CreatePlanParams$Outbound = {
    plan_id: string;
    group: string;
    name: string;
    description?: string | null | undefined;
    add_on: boolean;
    auto_enable: boolean;
    price?: CreatePlanPriceRequest$Outbound | undefined;
    items?: Array<CreatePlanPlanItem$Outbound> | undefined;
    free_trial?: FreeTrialRequest$Outbound | undefined;
};
/** @internal */
export declare const CreatePlanParams$outboundSchema: z.ZodMiniType<CreatePlanParams$Outbound, CreatePlanParams>;
export declare function createPlanParamsToJSON(createPlanParams: CreatePlanParams): string;
/** @internal */
export declare const CreatePlanPriceIntervalResponse$inboundSchema: z.ZodMiniType<CreatePlanPriceIntervalResponse, unknown>;
/** @internal */
export declare const CreatePlanPriceDisplay$inboundSchema: z.ZodMiniType<CreatePlanPriceDisplay, unknown>;
export declare function createPlanPriceDisplayFromJSON(jsonString: string): SafeParseResult<CreatePlanPriceDisplay, SDKValidationError>;
/** @internal */
export declare const CreatePlanPriceResponse$inboundSchema: z.ZodMiniType<CreatePlanPriceResponse, unknown>;
export declare function createPlanPriceResponseFromJSON(jsonString: string): SafeParseResult<CreatePlanPriceResponse, SDKValidationError>;
/** @internal */
export declare const CreatePlanType$inboundSchema: z.ZodMiniType<CreatePlanType, unknown>;
/** @internal */
export declare const CreatePlanFeatureDisplay$inboundSchema: z.ZodMiniType<CreatePlanFeatureDisplay, unknown>;
export declare function createPlanFeatureDisplayFromJSON(jsonString: string): SafeParseResult<CreatePlanFeatureDisplay, SDKValidationError>;
/** @internal */
export declare const CreatePlanCreditSchema$inboundSchema: z.ZodMiniType<CreatePlanCreditSchema, unknown>;
export declare function createPlanCreditSchemaFromJSON(jsonString: string): SafeParseResult<CreatePlanCreditSchema, SDKValidationError>;
/** @internal */
export declare const CreatePlanFeature$inboundSchema: z.ZodMiniType<CreatePlanFeature, unknown>;
export declare function createPlanFeatureFromJSON(jsonString: string): SafeParseResult<CreatePlanFeature, SDKValidationError>;
/** @internal */
export declare const CreatePlanResetIntervalResponse$inboundSchema: z.ZodMiniType<CreatePlanResetIntervalResponse, unknown>;
/** @internal */
export declare const CreatePlanResetResponse$inboundSchema: z.ZodMiniType<CreatePlanResetResponse, unknown>;
export declare function createPlanResetResponseFromJSON(jsonString: string): SafeParseResult<CreatePlanResetResponse, SDKValidationError>;
/** @internal */
export declare const CreatePlanTierBehaviorResponse$inboundSchema: z.ZodMiniType<CreatePlanTierBehaviorResponse, unknown>;
/** @internal */
export declare const CreatePlanPriceItemIntervalResponse$inboundSchema: z.ZodMiniType<CreatePlanPriceItemIntervalResponse, unknown>;
/** @internal */
export declare const CreatePlanBillingMethodResponse$inboundSchema: z.ZodMiniType<CreatePlanBillingMethodResponse, unknown>;
/** @internal */
export declare const CreatePlanItemPriceResponse$inboundSchema: z.ZodMiniType<CreatePlanItemPriceResponse, unknown>;
export declare function createPlanItemPriceResponseFromJSON(jsonString: string): SafeParseResult<CreatePlanItemPriceResponse, SDKValidationError>;
/** @internal */
export declare const CreatePlanItemDisplay$inboundSchema: z.ZodMiniType<CreatePlanItemDisplay, unknown>;
export declare function createPlanItemDisplayFromJSON(jsonString: string): SafeParseResult<CreatePlanItemDisplay, SDKValidationError>;
/** @internal */
export declare const CreatePlanExpiryDurationTypeResponse$inboundSchema: z.ZodMiniType<CreatePlanExpiryDurationTypeResponse, unknown>;
/** @internal */
export declare const CreatePlanRolloverResponse$inboundSchema: z.ZodMiniType<CreatePlanRolloverResponse, unknown>;
export declare function createPlanRolloverResponseFromJSON(jsonString: string): SafeParseResult<CreatePlanRolloverResponse, SDKValidationError>;
/** @internal */
export declare const CreatePlanItem$inboundSchema: z.ZodMiniType<CreatePlanItem, unknown>;
export declare function createPlanItemFromJSON(jsonString: string): SafeParseResult<CreatePlanItem, SDKValidationError>;
/** @internal */
export declare const CreatePlanDurationTypeResponse$inboundSchema: z.ZodMiniType<CreatePlanDurationTypeResponse, unknown>;
/** @internal */
export declare const CreatePlanFreeTrialResponse$inboundSchema: z.ZodMiniType<CreatePlanFreeTrialResponse, unknown>;
export declare function createPlanFreeTrialResponseFromJSON(jsonString: string): SafeParseResult<CreatePlanFreeTrialResponse, SDKValidationError>;
/** @internal */
export declare const CreatePlanEnv$inboundSchema: z.ZodMiniType<CreatePlanEnv, unknown>;
/** @internal */
export declare const CreatePlanStatus$inboundSchema: z.ZodMiniType<CreatePlanStatus, unknown>;
/** @internal */
export declare const CreatePlanAttachAction$inboundSchema: z.ZodMiniType<CreatePlanAttachAction, unknown>;
/** @internal */
export declare const CreatePlanCustomerEligibility$inboundSchema: z.ZodMiniType<CreatePlanCustomerEligibility, unknown>;
export declare function createPlanCustomerEligibilityFromJSON(jsonString: string): SafeParseResult<CreatePlanCustomerEligibility, SDKValidationError>;
/** @internal */
export declare const CreatePlanResponse$inboundSchema: z.ZodMiniType<CreatePlanResponse, unknown>;
export declare function createPlanResponseFromJSON(jsonString: string): SafeParseResult<CreatePlanResponse, SDKValidationError>;
