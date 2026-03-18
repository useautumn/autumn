import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const PlanPriceInterval: {
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
export type PlanPriceInterval = OpenEnum<typeof PlanPriceInterval>;
/**
 * Display text for showing this price in pricing pages.
 */
export type PlanPriceDisplay = {
    /**
     * Main display text (e.g. '$10' or '100 messages').
     */
    primaryText: string;
    /**
     * Secondary display text (e.g. 'per month' or 'then $0.5 per 100').
     */
    secondaryText?: string | undefined;
};
export type PlanPrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: PlanPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Display text for showing this price in pricing pages.
     */
    display?: PlanPriceDisplay | undefined;
};
/**
 * The type of the feature
 */
export declare const PlanType: {
    readonly Static: "static";
    readonly Boolean: "boolean";
    readonly SingleUse: "single_use";
    readonly ContinuousUse: "continuous_use";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature
 */
export type PlanType = OpenEnum<typeof PlanType>;
export type PlanFeatureDisplay = {
    /**
     * The singular display name for the feature.
     */
    singular: string;
    /**
     * The plural display name for the feature.
     */
    plural: string;
};
export type PlanCreditSchema = {
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
export type PlanFeature = {
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
    type: PlanType;
    /**
     * Singular and plural display names for the feature.
     */
    display?: PlanFeatureDisplay | null | undefined;
    /**
     * Credit cost schema for credit system features.
     */
    creditSchema?: Array<PlanCreditSchema> | null | undefined;
    /**
     * Whether or not the feature is archived.
     */
    archived?: boolean | null | undefined;
};
/**
 * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
 */
export declare const PlanResetInterval: {
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
export type PlanResetInterval = OpenEnum<typeof PlanResetInterval>;
export type PlanReset = {
    /**
     * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
     */
    interval: PlanResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export declare const PlanTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type PlanTierBehavior = OpenEnum<typeof PlanTierBehavior>;
/**
 * Billing interval for this price. For consumable features, should match reset.interval.
 */
export declare const PlanPriceItemInterval: {
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
export type PlanPriceItemInterval = OpenEnum<typeof PlanPriceItemInterval>;
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export declare const PlanBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export type PlanBillingMethod = OpenEnum<typeof PlanBillingMethod>;
export type PlanItemPrice = {
    /**
     * Price per billing_units after included usage is consumed. Mutually exclusive with tiers.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing configuration. Each tier's 'to' INCLUDES the included amount. Either 'tiers' or 'amount' is required.
     */
    tiers?: Array<any | null> | undefined;
    tierBehavior?: PlanTierBehavior | undefined;
    /**
     * Billing interval for this price. For consumable features, should match reset.interval.
     */
    interval: PlanPriceItemInterval;
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
    billingMethod: PlanBillingMethod;
    /**
     * Maximum units a customer can purchase beyond included. E.g. if included=100 and max_purchase=300, customer can use up to 400 total before usage is capped. Null for no limit.
     */
    maxPurchase: number | null;
};
/**
 * Display text for showing this item in pricing pages.
 */
export type PlanItemDisplay = {
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
export declare const ExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type ExpiryDurationType = OpenEnum<typeof ExpiryDurationType>;
/**
 * Rollover configuration for unused units. If set, unused included units roll over to the next period.
 */
export type PlanRollover = {
    /**
     * Maximum rollover units. Null for unlimited rollover.
     */
    max: number | null;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: ExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
export type Item = {
    /**
     * The ID of the feature this item configures.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: PlanFeature | undefined;
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
    reset: PlanReset | null;
    /**
     * Pricing configuration for usage beyond included units. Null if feature is entirely free.
     */
    price: PlanItemPrice | null;
    /**
     * Display text for showing this item in pricing pages.
     */
    display?: PlanItemDisplay | undefined;
    /**
     * Rollover configuration for unused units. If set, unused included units roll over to the next period.
     */
    rollover?: PlanRollover | undefined;
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export declare const PlanDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export type PlanDurationType = OpenEnum<typeof PlanDurationType>;
/**
 * Free trial configuration. If set, new customers can try this plan before being charged.
 */
export type FreeTrial = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial duration ('day', 'month', 'year').
     */
    durationType: PlanDurationType;
    /**
     * Whether a payment method is required to start the trial. If true, customer will be charged after trial ends.
     */
    cardRequired: boolean;
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export declare const PlanEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export type PlanEnv = OpenEnum<typeof PlanEnv>;
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export declare const PlanStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export type PlanStatus = OpenEnum<typeof PlanStatus>;
/**
 * The action that would occur if this plan were attached to the customer.
 */
export declare const AttachAction: {
    readonly Activate: "activate";
    readonly Upgrade: "upgrade";
    readonly Downgrade: "downgrade";
    readonly None: "none";
    readonly Purchase: "purchase";
};
/**
 * The action that would occur if this plan were attached to the customer.
 */
export type AttachAction = OpenEnum<typeof AttachAction>;
export type CustomerEligibility = {
    /**
     * Whether the trial on this plan is available to this customer. For example, if the customer used the trial in the past, this will be false.
     */
    trialAvailable?: boolean | undefined;
    /**
     * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
     */
    status?: PlanStatus | undefined;
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
    attachAction: AttachAction;
};
export type Plan = {
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
    price: PlanPrice | null;
    /**
     * Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature.
     */
    items: Array<Item>;
    /**
     * Free trial configuration. If set, new customers can try this plan before being charged.
     */
    freeTrial?: FreeTrial | undefined;
    /**
     * Unix timestamp (ms) when the plan was created.
     */
    createdAt: number;
    /**
     * Environment this plan belongs to ('sandbox' or 'live').
     */
    env: PlanEnv;
    /**
     * Whether the plan is archived. Archived plans cannot be attached to new customers.
     */
    archived: boolean;
    /**
     * If this is a variant, the ID of the base plan it was created from.
     */
    baseVariantId: string | null;
    customerEligibility?: CustomerEligibility | undefined;
};
/** @internal */
export declare const PlanPriceInterval$inboundSchema: z.ZodMiniType<PlanPriceInterval, unknown>;
/** @internal */
export declare const PlanPriceDisplay$inboundSchema: z.ZodMiniType<PlanPriceDisplay, unknown>;
export declare function planPriceDisplayFromJSON(jsonString: string): SafeParseResult<PlanPriceDisplay, SDKValidationError>;
/** @internal */
export declare const PlanPrice$inboundSchema: z.ZodMiniType<PlanPrice, unknown>;
export declare function planPriceFromJSON(jsonString: string): SafeParseResult<PlanPrice, SDKValidationError>;
/** @internal */
export declare const PlanType$inboundSchema: z.ZodMiniType<PlanType, unknown>;
/** @internal */
export declare const PlanFeatureDisplay$inboundSchema: z.ZodMiniType<PlanFeatureDisplay, unknown>;
export declare function planFeatureDisplayFromJSON(jsonString: string): SafeParseResult<PlanFeatureDisplay, SDKValidationError>;
/** @internal */
export declare const PlanCreditSchema$inboundSchema: z.ZodMiniType<PlanCreditSchema, unknown>;
export declare function planCreditSchemaFromJSON(jsonString: string): SafeParseResult<PlanCreditSchema, SDKValidationError>;
/** @internal */
export declare const PlanFeature$inboundSchema: z.ZodMiniType<PlanFeature, unknown>;
export declare function planFeatureFromJSON(jsonString: string): SafeParseResult<PlanFeature, SDKValidationError>;
/** @internal */
export declare const PlanResetInterval$inboundSchema: z.ZodMiniType<PlanResetInterval, unknown>;
/** @internal */
export declare const PlanReset$inboundSchema: z.ZodMiniType<PlanReset, unknown>;
export declare function planResetFromJSON(jsonString: string): SafeParseResult<PlanReset, SDKValidationError>;
/** @internal */
export declare const PlanTierBehavior$inboundSchema: z.ZodMiniType<PlanTierBehavior, unknown>;
/** @internal */
export declare const PlanPriceItemInterval$inboundSchema: z.ZodMiniType<PlanPriceItemInterval, unknown>;
/** @internal */
export declare const PlanBillingMethod$inboundSchema: z.ZodMiniType<PlanBillingMethod, unknown>;
/** @internal */
export declare const PlanItemPrice$inboundSchema: z.ZodMiniType<PlanItemPrice, unknown>;
export declare function planItemPriceFromJSON(jsonString: string): SafeParseResult<PlanItemPrice, SDKValidationError>;
/** @internal */
export declare const PlanItemDisplay$inboundSchema: z.ZodMiniType<PlanItemDisplay, unknown>;
export declare function planItemDisplayFromJSON(jsonString: string): SafeParseResult<PlanItemDisplay, SDKValidationError>;
/** @internal */
export declare const ExpiryDurationType$inboundSchema: z.ZodMiniType<ExpiryDurationType, unknown>;
/** @internal */
export declare const PlanRollover$inboundSchema: z.ZodMiniType<PlanRollover, unknown>;
export declare function planRolloverFromJSON(jsonString: string): SafeParseResult<PlanRollover, SDKValidationError>;
/** @internal */
export declare const Item$inboundSchema: z.ZodMiniType<Item, unknown>;
export declare function itemFromJSON(jsonString: string): SafeParseResult<Item, SDKValidationError>;
/** @internal */
export declare const PlanDurationType$inboundSchema: z.ZodMiniType<PlanDurationType, unknown>;
/** @internal */
export declare const FreeTrial$inboundSchema: z.ZodMiniType<FreeTrial, unknown>;
export declare function freeTrialFromJSON(jsonString: string): SafeParseResult<FreeTrial, SDKValidationError>;
/** @internal */
export declare const PlanEnv$inboundSchema: z.ZodMiniType<PlanEnv, unknown>;
/** @internal */
export declare const PlanStatus$inboundSchema: z.ZodMiniType<PlanStatus, unknown>;
/** @internal */
export declare const AttachAction$inboundSchema: z.ZodMiniType<AttachAction, unknown>;
/** @internal */
export declare const CustomerEligibility$inboundSchema: z.ZodMiniType<CustomerEligibility, unknown>;
export declare function customerEligibilityFromJSON(jsonString: string): SafeParseResult<CustomerEligibility, SDKValidationError>;
/** @internal */
export declare const Plan$inboundSchema: z.ZodMiniType<Plan, unknown>;
export declare function planFromJSON(jsonString: string): SafeParseResult<Plan, SDKValidationError>;
