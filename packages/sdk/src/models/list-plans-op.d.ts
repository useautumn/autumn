import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type ListPlansGlobals = {
    xApiVersion?: string | undefined;
};
export type ListPlansParams = {
    /**
     * Customer ID to include eligibility info (trial availability, attach scenario).
     */
    customerId?: string | undefined;
    /**
     * Entity ID for entity-scoped plans.
     */
    entityId?: string | undefined;
    /**
     * If true, includes archived plans in the response.
     */
    includeArchived?: boolean | undefined;
};
/**
 * Billing interval (e.g. 'month', 'year').
 */
export declare const ListPlansPriceInterval: {
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
export type ListPlansPriceInterval = OpenEnum<typeof ListPlansPriceInterval>;
/**
 * Display text for showing this price in pricing pages.
 */
export type ListPlansPriceDisplay = {
    /**
     * Main display text (e.g. '$10' or '100 messages').
     */
    primaryText: string;
    /**
     * Secondary display text (e.g. 'per month' or 'then $0.5 per 100').
     */
    secondaryText?: string | undefined;
};
export type ListPlansPrice = {
    /**
     * Base price amount for the plan.
     */
    amount: number;
    /**
     * Billing interval (e.g. 'month', 'year').
     */
    interval: ListPlansPriceInterval;
    /**
     * Number of intervals per billing cycle. Defaults to 1.
     */
    intervalCount?: number | undefined;
    /**
     * Display text for showing this price in pricing pages.
     */
    display?: ListPlansPriceDisplay | undefined;
};
/**
 * The type of the feature
 */
export declare const ListPlansType: {
    readonly Static: "static";
    readonly Boolean: "boolean";
    readonly SingleUse: "single_use";
    readonly ContinuousUse: "continuous_use";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature
 */
export type ListPlansType = OpenEnum<typeof ListPlansType>;
export type ListPlansFeatureDisplay = {
    /**
     * The singular display name for the feature.
     */
    singular: string;
    /**
     * The plural display name for the feature.
     */
    plural: string;
};
export type ListPlansCreditSchema = {
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
export type ListPlansFeature = {
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
    type: ListPlansType;
    /**
     * Singular and plural display names for the feature.
     */
    display?: ListPlansFeatureDisplay | null | undefined;
    /**
     * Credit cost schema for credit system features.
     */
    creditSchema?: Array<ListPlansCreditSchema> | null | undefined;
    /**
     * Whether or not the feature is archived.
     */
    archived?: boolean | null | undefined;
};
/**
 * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
 */
export declare const ListPlansResetInterval: {
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
export type ListPlansResetInterval = OpenEnum<typeof ListPlansResetInterval>;
export type ListPlansReset = {
    /**
     * The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.
     */
    interval: ListPlansResetInterval;
    /**
     * Number of intervals between resets. Defaults to 1.
     */
    intervalCount?: number | undefined;
};
export declare const ListPlansTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type ListPlansTierBehavior = OpenEnum<typeof ListPlansTierBehavior>;
/**
 * Billing interval for this price. For consumable features, should match reset.interval.
 */
export declare const ListPlansPriceItemInterval: {
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
export type ListPlansPriceItemInterval = OpenEnum<typeof ListPlansPriceItemInterval>;
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export declare const ListPlansBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * 'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.
 */
export type ListPlansBillingMethod = OpenEnum<typeof ListPlansBillingMethod>;
export type ListPlansItemPrice = {
    /**
     * Price per billing_units after included usage is consumed. Mutually exclusive with tiers.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing configuration. Each tier's 'to' INCLUDES the included amount. Either 'tiers' or 'amount' is required.
     */
    tiers?: Array<any | null> | undefined;
    tierBehavior?: ListPlansTierBehavior | undefined;
    /**
     * Billing interval for this price. For consumable features, should match reset.interval.
     */
    interval: ListPlansPriceItemInterval;
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
    billingMethod: ListPlansBillingMethod;
    /**
     * Maximum units a customer can purchase beyond included. E.g. if included=100 and max_purchase=300, customer can use up to 400 total before usage is capped. Null for no limit.
     */
    maxPurchase: number | null;
};
/**
 * Display text for showing this item in pricing pages.
 */
export type ListPlansItemDisplay = {
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
export declare const ListPlansExpiryDurationType: {
    readonly Month: "month";
    readonly Forever: "forever";
};
/**
 * When rolled over units expire.
 */
export type ListPlansExpiryDurationType = OpenEnum<typeof ListPlansExpiryDurationType>;
/**
 * Rollover configuration for unused units. If set, unused included units roll over to the next period.
 */
export type ListPlansRollover = {
    /**
     * Maximum rollover units. Null for unlimited rollover.
     */
    max: number | null;
    /**
     * When rolled over units expire.
     */
    expiryDurationType: ListPlansExpiryDurationType;
    /**
     * Number of periods before expiry.
     */
    expiryDurationLength?: number | undefined;
};
export type ListPlansItem = {
    /**
     * The ID of the feature this item configures.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: ListPlansFeature | undefined;
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
    reset: ListPlansReset | null;
    /**
     * Pricing configuration for usage beyond included units. Null if feature is entirely free.
     */
    price: ListPlansItemPrice | null;
    /**
     * Display text for showing this item in pricing pages.
     */
    display?: ListPlansItemDisplay | undefined;
    /**
     * Rollover configuration for unused units. If set, unused included units roll over to the next period.
     */
    rollover?: ListPlansRollover | undefined;
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export declare const ListPlansDurationType: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * Unit of time for the trial duration ('day', 'month', 'year').
 */
export type ListPlansDurationType = OpenEnum<typeof ListPlansDurationType>;
/**
 * Free trial configuration. If set, new customers can try this plan before being charged.
 */
export type ListPlansFreeTrial = {
    /**
     * Number of duration_type periods the trial lasts.
     */
    durationLength: number;
    /**
     * Unit of time for the trial duration ('day', 'month', 'year').
     */
    durationType: ListPlansDurationType;
    /**
     * Whether a payment method is required to start the trial. If true, customer will be charged after trial ends.
     */
    cardRequired: boolean;
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export declare const ListPlansEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * Environment this plan belongs to ('sandbox' or 'live').
 */
export type ListPlansEnv = OpenEnum<typeof ListPlansEnv>;
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export declare const ListPlansStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
 */
export type ListPlansStatus = OpenEnum<typeof ListPlansStatus>;
/**
 * The action that would occur if this plan were attached to the customer.
 */
export declare const ListPlansAttachAction: {
    readonly Activate: "activate";
    readonly Upgrade: "upgrade";
    readonly Downgrade: "downgrade";
    readonly None: "none";
    readonly Purchase: "purchase";
};
/**
 * The action that would occur if this plan were attached to the customer.
 */
export type ListPlansAttachAction = OpenEnum<typeof ListPlansAttachAction>;
export type ListPlansCustomerEligibility = {
    /**
     * Whether the trial on this plan is available to this customer. For example, if the customer used the trial in the past, this will be false.
     */
    trialAvailable?: boolean | undefined;
    /**
     * The customer's current status with this plan. 'active' if attached, 'scheduled' if pending activation.
     */
    status?: ListPlansStatus | undefined;
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
    attachAction: ListPlansAttachAction;
};
/**
 * A plan defines a set of features, pricing, and entitlements that can be attached to customers.
 */
export type ListPlansList = {
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
    price: ListPlansPrice | null;
    /**
     * Feature configurations included in this plan. Each item defines included units, pricing, and reset behavior for a feature.
     */
    items: Array<ListPlansItem>;
    /**
     * Free trial configuration. If set, new customers can try this plan before being charged.
     */
    freeTrial?: ListPlansFreeTrial | undefined;
    /**
     * Unix timestamp (ms) when the plan was created.
     */
    createdAt: number;
    /**
     * Environment this plan belongs to ('sandbox' or 'live').
     */
    env: ListPlansEnv;
    /**
     * Whether the plan is archived. Archived plans cannot be attached to new customers.
     */
    archived: boolean;
    /**
     * If this is a variant, the ID of the base plan it was created from.
     */
    baseVariantId: string | null;
    customerEligibility?: ListPlansCustomerEligibility | undefined;
};
/**
 * OK
 */
export type ListPlansResponse = {
    list: Array<ListPlansList>;
};
/** @internal */
export type ListPlansParams$Outbound = {
    customer_id?: string | undefined;
    entity_id?: string | undefined;
    include_archived?: boolean | undefined;
};
/** @internal */
export declare const ListPlansParams$outboundSchema: z.ZodMiniType<ListPlansParams$Outbound, ListPlansParams>;
export declare function listPlansParamsToJSON(listPlansParams: ListPlansParams): string;
/** @internal */
export declare const ListPlansPriceInterval$inboundSchema: z.ZodMiniType<ListPlansPriceInterval, unknown>;
/** @internal */
export declare const ListPlansPriceDisplay$inboundSchema: z.ZodMiniType<ListPlansPriceDisplay, unknown>;
export declare function listPlansPriceDisplayFromJSON(jsonString: string): SafeParseResult<ListPlansPriceDisplay, SDKValidationError>;
/** @internal */
export declare const ListPlansPrice$inboundSchema: z.ZodMiniType<ListPlansPrice, unknown>;
export declare function listPlansPriceFromJSON(jsonString: string): SafeParseResult<ListPlansPrice, SDKValidationError>;
/** @internal */
export declare const ListPlansType$inboundSchema: z.ZodMiniType<ListPlansType, unknown>;
/** @internal */
export declare const ListPlansFeatureDisplay$inboundSchema: z.ZodMiniType<ListPlansFeatureDisplay, unknown>;
export declare function listPlansFeatureDisplayFromJSON(jsonString: string): SafeParseResult<ListPlansFeatureDisplay, SDKValidationError>;
/** @internal */
export declare const ListPlansCreditSchema$inboundSchema: z.ZodMiniType<ListPlansCreditSchema, unknown>;
export declare function listPlansCreditSchemaFromJSON(jsonString: string): SafeParseResult<ListPlansCreditSchema, SDKValidationError>;
/** @internal */
export declare const ListPlansFeature$inboundSchema: z.ZodMiniType<ListPlansFeature, unknown>;
export declare function listPlansFeatureFromJSON(jsonString: string): SafeParseResult<ListPlansFeature, SDKValidationError>;
/** @internal */
export declare const ListPlansResetInterval$inboundSchema: z.ZodMiniType<ListPlansResetInterval, unknown>;
/** @internal */
export declare const ListPlansReset$inboundSchema: z.ZodMiniType<ListPlansReset, unknown>;
export declare function listPlansResetFromJSON(jsonString: string): SafeParseResult<ListPlansReset, SDKValidationError>;
/** @internal */
export declare const ListPlansTierBehavior$inboundSchema: z.ZodMiniType<ListPlansTierBehavior, unknown>;
/** @internal */
export declare const ListPlansPriceItemInterval$inboundSchema: z.ZodMiniType<ListPlansPriceItemInterval, unknown>;
/** @internal */
export declare const ListPlansBillingMethod$inboundSchema: z.ZodMiniType<ListPlansBillingMethod, unknown>;
/** @internal */
export declare const ListPlansItemPrice$inboundSchema: z.ZodMiniType<ListPlansItemPrice, unknown>;
export declare function listPlansItemPriceFromJSON(jsonString: string): SafeParseResult<ListPlansItemPrice, SDKValidationError>;
/** @internal */
export declare const ListPlansItemDisplay$inboundSchema: z.ZodMiniType<ListPlansItemDisplay, unknown>;
export declare function listPlansItemDisplayFromJSON(jsonString: string): SafeParseResult<ListPlansItemDisplay, SDKValidationError>;
/** @internal */
export declare const ListPlansExpiryDurationType$inboundSchema: z.ZodMiniType<ListPlansExpiryDurationType, unknown>;
/** @internal */
export declare const ListPlansRollover$inboundSchema: z.ZodMiniType<ListPlansRollover, unknown>;
export declare function listPlansRolloverFromJSON(jsonString: string): SafeParseResult<ListPlansRollover, SDKValidationError>;
/** @internal */
export declare const ListPlansItem$inboundSchema: z.ZodMiniType<ListPlansItem, unknown>;
export declare function listPlansItemFromJSON(jsonString: string): SafeParseResult<ListPlansItem, SDKValidationError>;
/** @internal */
export declare const ListPlansDurationType$inboundSchema: z.ZodMiniType<ListPlansDurationType, unknown>;
/** @internal */
export declare const ListPlansFreeTrial$inboundSchema: z.ZodMiniType<ListPlansFreeTrial, unknown>;
export declare function listPlansFreeTrialFromJSON(jsonString: string): SafeParseResult<ListPlansFreeTrial, SDKValidationError>;
/** @internal */
export declare const ListPlansEnv$inboundSchema: z.ZodMiniType<ListPlansEnv, unknown>;
/** @internal */
export declare const ListPlansStatus$inboundSchema: z.ZodMiniType<ListPlansStatus, unknown>;
/** @internal */
export declare const ListPlansAttachAction$inboundSchema: z.ZodMiniType<ListPlansAttachAction, unknown>;
/** @internal */
export declare const ListPlansCustomerEligibility$inboundSchema: z.ZodMiniType<ListPlansCustomerEligibility, unknown>;
export declare function listPlansCustomerEligibilityFromJSON(jsonString: string): SafeParseResult<ListPlansCustomerEligibility, SDKValidationError>;
/** @internal */
export declare const ListPlansList$inboundSchema: z.ZodMiniType<ListPlansList, unknown>;
export declare function listPlansListFromJSON(jsonString: string): SafeParseResult<ListPlansList, SDKValidationError>;
/** @internal */
export declare const ListPlansResponse$inboundSchema: z.ZodMiniType<ListPlansResponse, unknown>;
export declare function listPlansResponseFromJSON(jsonString: string): SafeParseResult<ListPlansResponse, SDKValidationError>;
