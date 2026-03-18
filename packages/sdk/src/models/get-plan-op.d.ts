import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type GetPlanGlobals = {
    xApiVersion?: string | undefined;
};
export type GetPlanParams = {
    /**
     * The ID of the plan to retrieve.
     */
    planId: string;
    /**
     * The version of the plan to get. Defaults to the latest version.
     */
    version?: number | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const GetPlanPriceInterval: {
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
export type GetPlanPriceInterval = OpenEnum<typeof GetPlanPriceInterval>;
/**
 * Display text for showing this price in pricing pages.
 */
export type GetPlanPriceDisplay = {
    /**
     * Main display text (e.g. '$10' or '100 messages').
     */
    primaryText: string;
    /**
     * Secondary display text (e.g. 'per month' or 'then $0.5 per 100').
     */
    secondaryText?: string | undefined;
};
export type GetPlanPrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: GetPlanPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Display text for showing this price in pricing pages.
     */
    display?: GetPlanPriceDisplay | undefined;
};
/**
 * The type of the feature
 */
export declare const GetPlanType: {
    readonly Static: "static";
    readonly Boolean: "boolean";
    readonly SingleUse: "single_use";
    readonly ContinuousUse: "continuous_use";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature
 */
export type GetPlanType = OpenEnum<typeof GetPlanType>;
export type GetPlanFeatureDisplay = {
    /**
     * The singular display name for the feature.
     */
    singular: string;
    /**
     * The plural display name for the feature.
     */
    plural: string;
};
export type GetPlanCreditSchema = {
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
export type GetPlanFeature = {
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
    type: GetPlanType;
    /**
     * Singular and plural display names for the feature.
     */
    display?: GetPlanFeatureDisplay | null | undefined;
    /**
     * Credit cost schema for credit system features.
     */
    creditSchema?: Array<GetPlanCreditSchema> | null | undefined;
    /**
     * Whether or not the feature is archived.
     */
    archived?: boolean | null | undefined;
};
/**
 * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
 */
export declare const GetPlanResetInterval: {
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
export type GetPlanResetInterval = OpenEnum<typeof GetPlanResetInterval>;
export type GetPlanReset = {
    /**
     * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
     */
    interval: GetPlanResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export declare const GetPlanTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type GetPlanTierBehavior = OpenEnum<typeof GetPlanTierBehavior>;
/**
 * Billing interval for this price. For consumable features, should match reset.interval.
 */
export declare const GetPlanPriceItemInterval: {
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
export type GetPlanPriceItemInterval = OpenEnum<typeof GetPlanPriceItemInterval>;
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export declare const GetPlanBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export type GetPlanBillingMethod = OpenEnum<typeof GetPlanBillingMethod>;
export type GetPlanItemPrice = {
    /**
     * Price per billing_units after included usage is consumed. Mutually exclusive with tiers.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing configuration. Each tier's 'to' INCLUDES the included amount. Either 'tiers' or 'amount' is required.
     */
    tiers?: Array<any | null> | undefined;
    tierBehavior?: GetPlanTierBehavior | undefined;
    /**
     * Billing interval for this price. For consumable features, should match reset.interval.
     */
    interval: GetPlanPriceItemInterval;
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
    billingMethod: GetPlanBillingMethod;
    /**
     * Maximum units a customer can purchase beyond included. E.g. if included=100 and max_purchase=300, customer can use up to 400 total before usage is capped. Null for no limit.
     */
    maxPurchase: number | null;
};
/**
 * Display text for showing this item in pricing pages.
 */
export type GetPlanItemDisplay = {
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
export declare const GetPlanExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type GetPlanExpiryDurationType = OpenEnum<typeof GetPlanExpiryDurationType>;
/**
 * Rollover configuration for unused units. If set, unused included units roll over to the next period.
 */
export type GetPlanRollover = {
    /**
     * Maximum rollover units. Null for unlimited rollover.
     */
    max: number | null;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: GetPlanExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
export type GetPlanItem = {
    /**
     * The ID of the feature this item configures.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: GetPlanFeature | undefined;
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
    reset: GetPlanReset | null;
    /**
     * Pricing configuration for usage beyond included units. Null if feature is entirely free.
     */
    price: GetPlanItemPrice | null;
    /**
     * Display text for showing this item in pricing pages.
     */
    display?: GetPlanItemDisplay | undefined;
    /**
     * Rollover configuration for unused units. If set, unused included units roll over to the next period.
     */
    rollover?: GetPlanRollover | undefined;
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export declare const GetPlanDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export type GetPlanDurationType = OpenEnum<typeof GetPlanDurationType>;
/**
 * Free trial configuration. If set, new customers can try this plan before being charged.
 */
export type GetPlanFreeTrial = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial duration ('day', 'month', 'year').
     */
    durationType: GetPlanDurationType;
    /**
     * Whether a payment method is required to start the trial. If true, customer will be charged after trial ends.
     */
    cardRequired: boolean;
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export declare const GetPlanEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export type GetPlanEnv = OpenEnum<typeof GetPlanEnv>;
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export declare const GetPlanStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export type GetPlanStatus = OpenEnum<typeof GetPlanStatus>;
/**
 * The action that would occur if this plan were attached to the customer.
 */
export declare const GetPlanAttachAction: {
    readonly Activate: "activate";
    readonly Upgrade: "upgrade";
    readonly Downgrade: "downgrade";
    readonly None: "none";
    readonly Purchase: "purchase";
};
/**
 * The action that would occur if this plan were attached to the customer.
 */
export type GetPlanAttachAction = OpenEnum<typeof GetPlanAttachAction>;
export type GetPlanCustomerEligibility = {
    /**
     * Whether the trial on this plan is available to this customer. For example, if the customer used the trial in the past, this will be false.
     */
    trialAvailable?: boolean | undefined;
    /**
     * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
     */
    status?: GetPlanStatus | undefined;
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
    attachAction: GetPlanAttachAction;
};
/**
 * A plan defines a set of features, pricing, and entitlements that can be attached to customers.
 */
export type GetPlanResponse = {
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
    price: GetPlanPrice | null;
    /**
     * Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature.
     */
    items: Array<GetPlanItem>;
    /**
     * Free trial configuration. If set, new customers can try this plan before being charged.
     */
    freeTrial?: GetPlanFreeTrial | undefined;
    /**
     * Unix timestamp (ms) when the plan was created.
     */
    createdAt: number;
    /**
     * Environment this plan belongs to ('sandbox' or 'live').
     */
    env: GetPlanEnv;
    /**
     * Whether the plan is archived. Archived plans cannot be attached to new customers.
     */
    archived: boolean;
    /**
     * If this is a variant, the ID of the base plan it was created from.
     */
    baseVariantId: string | null;
    customerEligibility?: GetPlanCustomerEligibility | undefined;
};
/** @internal */
export type GetPlanParams$Outbound = {
    plan_id: string;
    version?: number | undefined;
};
/** @internal */
export declare const GetPlanParams$outboundSchema: z.ZodMiniType<GetPlanParams$Outbound, GetPlanParams>;
export declare function getPlanParamsToJSON(getPlanParams: GetPlanParams): string;
/** @internal */
export declare const GetPlanPriceInterval$inboundSchema: z.ZodMiniType<GetPlanPriceInterval, unknown>;
/** @internal */
export declare const GetPlanPriceDisplay$inboundSchema: z.ZodMiniType<GetPlanPriceDisplay, unknown>;
export declare function getPlanPriceDisplayFromJSON(jsonString: string): SafeParseResult<GetPlanPriceDisplay, SDKValidationError>;
/** @internal */
export declare const GetPlanPrice$inboundSchema: z.ZodMiniType<GetPlanPrice, unknown>;
export declare function getPlanPriceFromJSON(jsonString: string): SafeParseResult<GetPlanPrice, SDKValidationError>;
/** @internal */
export declare const GetPlanType$inboundSchema: z.ZodMiniType<GetPlanType, unknown>;
/** @internal */
export declare const GetPlanFeatureDisplay$inboundSchema: z.ZodMiniType<GetPlanFeatureDisplay, unknown>;
export declare function getPlanFeatureDisplayFromJSON(jsonString: string): SafeParseResult<GetPlanFeatureDisplay, SDKValidationError>;
/** @internal */
export declare const GetPlanCreditSchema$inboundSchema: z.ZodMiniType<GetPlanCreditSchema, unknown>;
export declare function getPlanCreditSchemaFromJSON(jsonString: string): SafeParseResult<GetPlanCreditSchema, SDKValidationError>;
/** @internal */
export declare const GetPlanFeature$inboundSchema: z.ZodMiniType<GetPlanFeature, unknown>;
export declare function getPlanFeatureFromJSON(jsonString: string): SafeParseResult<GetPlanFeature, SDKValidationError>;
/** @internal */
export declare const GetPlanResetInterval$inboundSchema: z.ZodMiniType<GetPlanResetInterval, unknown>;
/** @internal */
export declare const GetPlanReset$inboundSchema: z.ZodMiniType<GetPlanReset, unknown>;
export declare function getPlanResetFromJSON(jsonString: string): SafeParseResult<GetPlanReset, SDKValidationError>;
/** @internal */
export declare const GetPlanTierBehavior$inboundSchema: z.ZodMiniType<GetPlanTierBehavior, unknown>;
/** @internal */
export declare const GetPlanPriceItemInterval$inboundSchema: z.ZodMiniType<GetPlanPriceItemInterval, unknown>;
/** @internal */
export declare const GetPlanBillingMethod$inboundSchema: z.ZodMiniType<GetPlanBillingMethod, unknown>;
/** @internal */
export declare const GetPlanItemPrice$inboundSchema: z.ZodMiniType<GetPlanItemPrice, unknown>;
export declare function getPlanItemPriceFromJSON(jsonString: string): SafeParseResult<GetPlanItemPrice, SDKValidationError>;
/** @internal */
export declare const GetPlanItemDisplay$inboundSchema: z.ZodMiniType<GetPlanItemDisplay, unknown>;
export declare function getPlanItemDisplayFromJSON(jsonString: string): SafeParseResult<GetPlanItemDisplay, SDKValidationError>;
/** @internal */
export declare const GetPlanExpiryDurationType$inboundSchema: z.ZodMiniType<GetPlanExpiryDurationType, unknown>;
/** @internal */
export declare const GetPlanRollover$inboundSchema: z.ZodMiniType<GetPlanRollover, unknown>;
export declare function getPlanRolloverFromJSON(jsonString: string): SafeParseResult<GetPlanRollover, SDKValidationError>;
/** @internal */
export declare const GetPlanItem$inboundSchema: z.ZodMiniType<GetPlanItem, unknown>;
export declare function getPlanItemFromJSON(jsonString: string): SafeParseResult<GetPlanItem, SDKValidationError>;
/** @internal */
export declare const GetPlanDurationType$inboundSchema: z.ZodMiniType<GetPlanDurationType, unknown>;
/** @internal */
export declare const GetPlanFreeTrial$inboundSchema: z.ZodMiniType<GetPlanFreeTrial, unknown>;
export declare function getPlanFreeTrialFromJSON(jsonString: string): SafeParseResult<GetPlanFreeTrial, SDKValidationError>;
/** @internal */
export declare const GetPlanEnv$inboundSchema: z.ZodMiniType<GetPlanEnv, unknown>;
/** @internal */
export declare const GetPlanStatus$inboundSchema: z.ZodMiniType<GetPlanStatus, unknown>;
/** @internal */
export declare const GetPlanAttachAction$inboundSchema: z.ZodMiniType<GetPlanAttachAction, unknown>;
/** @internal */
export declare const GetPlanCustomerEligibility$inboundSchema: z.ZodMiniType<GetPlanCustomerEligibility, unknown>;
export declare function getPlanCustomerEligibilityFromJSON(jsonString: string): SafeParseResult<GetPlanCustomerEligibility, SDKValidationError>;
/** @internal */
export declare const GetPlanResponse$inboundSchema: z.ZodMiniType<GetPlanResponse, unknown>;
export declare function getPlanResponseFromJSON(jsonString: string): SafeParseResult<GetPlanResponse, SDKValidationError>;
