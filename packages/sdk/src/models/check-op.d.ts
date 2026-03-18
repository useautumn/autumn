import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type CheckGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Reserve units of a feature upfront by passing a lock_id, then call balances.finalize to confirm or release the hold.
 */
export type CheckLock = {
    /**
     * A unique identifier for this lock. Used to finalize the lock later via balances.finalize.
     */
    lockId: string;
    /**
     * Must be true to enable locking.
     */
    enabled: true;
    /**
     * Unix timestamp (ms) when the lock automatically expires and releases the held balance.
     */
    expiresAt?: number | undefined;
};
export type CheckParams = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * The ID of the feature.
     */
    featureId: string;
    /**
     * The ID of the entity for entity-scoped balances (e.g., per-seat limits).
     */
    entityId?: string | undefined;
    /**
     * Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1.
     */
    requiredBalance?: number | undefined;
    /**
     * Additional properties to attach to the usage event if send_event is true.
     */
    properties?: {
        [k: string]: any;
    } | undefined;
    /**
     * If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call.
     */
    sendEvent?: boolean | undefined;
    /**
     * Reserve units of a feature upfront by passing a lock_id, then call balances.finalize to confirm or release the hold.
     */
    lock?: CheckLock | undefined;
    /**
     * If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls.
     */
    withPreview?: boolean | undefined;
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const FlagType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type FlagType = OpenEnum<typeof FlagType>;
export type CheckCreditSchema = {
    /**
     * ID of the metered feature that draws from this credit system.
     */
    meteredFeatureId: string;
    /**
     * Credits consumed per unit of the metered feature.
     */
    creditCost: number;
};
/**
 * Display names for the feature in billing UI and customer-facing components.
 */
export type FlagDisplay = {
    /**
     * Singular form for UI display (e.g., 'API call', 'seat').
     */
    singular?: string | null | undefined;
    /**
     * Plural form for UI display (e.g., 'API calls', 'seats').
     */
    plural?: string | null | undefined;
};
/**
 * The full feature object if expanded.
 */
export type CheckFeature = {
    /**
     * The unique identifier for this feature, used in /check and /track calls.
     */
    id: string;
    /**
     * Human-readable name displayed in the dashboard and billing UI.
     */
    name: string;
    /**
     * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
     */
    type: FlagType;
    /**
     * For metered features: true if usage resets periodically (API calls, credits), false if allocated persistently (seats, storage).
     */
    consumable: boolean;
    /**
     * Event names that trigger this feature's balance. Allows multiple features to respond to a single event.
     */
    eventNames?: Array<string> | undefined;
    /**
     * For credit_system features: maps metered features to their credit costs.
     */
    creditSchema?: Array<CheckCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: FlagDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type Flag = {
    /**
     * The unique identifier for this flag.
     */
    id: string;
    /**
     * The plan ID this flag originates from, or null for standalone flags.
     */
    planId: string | null;
    /**
     * Timestamp when this flag expires, or null for no expiration.
     */
    expiresAt: number | null;
    /**
     * The feature ID this flag is for.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: CheckFeature | undefined;
};
/**
 * The reason access was denied. 'usage_limit' means the customer exceeded their balance, 'feature_flag' means the feature is not included in their plan.
 */
export declare const Scenario: {
    readonly UsageLimit: "usage_limit";
    readonly FeatureFlag: "feature_flag";
};
/**
 * The reason access was denied. 'usage_limit' means the customer exceeded their balance, 'feature_flag' means the feature is not included in their plan.
 */
export type Scenario = OpenEnum<typeof Scenario>;
/**
 * The environment of the product
 */
export declare const CheckEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment of the product
 */
export type CheckEnv = OpenEnum<typeof CheckEnv>;
export declare const ProductType: {
    readonly Feature: "feature";
    readonly PricedFeature: "priced_feature";
    readonly Price: "price";
};
export type ProductType = OpenEnum<typeof ProductType>;
export declare const FeatureType: {
    readonly SingleUse: "single_use";
    readonly ContinuousUse: "continuous_use";
    readonly Boolean: "boolean";
    readonly Static: "static";
};
export type FeatureType = OpenEnum<typeof FeatureType>;
export type IncludedUsage = number | string;
export declare const CheckInterval: {
    readonly Minute: "minute";
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
    readonly Quarter: "quarter";
    readonly SemiAnnual: "semi_annual";
    readonly Year: "year";
};
export type CheckInterval = OpenEnum<typeof CheckInterval>;
export declare const CheckTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
export type CheckTierBehavior = OpenEnum<typeof CheckTierBehavior>;
export declare const UsageModel: {
    readonly Prepaid: "prepaid";
    readonly PayPerUse: "pay_per_use";
};
export type UsageModel = OpenEnum<typeof UsageModel>;
export type ProductDisplay = {
    primaryText: string;
    secondaryText?: string | null | undefined;
};
export declare const RolloverDuration: {
    readonly Month: "month";
    readonly Forever: "forever";
};
export type RolloverDuration = OpenEnum<typeof RolloverDuration>;
export type CheckRollover = {
    max: number | null;
    duration: RolloverDuration;
    length: number;
};
export declare const CheckOnIncrease: {
    readonly BillImmediately: "bill_immediately";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly BillNextCycle: "bill_next_cycle";
};
export type CheckOnIncrease = OpenEnum<typeof CheckOnIncrease>;
export declare const CheckOnDecrease: {
    readonly Prorate: "prorate";
    readonly ProrateImmediately: "prorate_immediately";
    readonly ProrateNextCycle: "prorate_next_cycle";
    readonly None: "none";
    readonly NoProrations: "no_prorations";
};
export type CheckOnDecrease = OpenEnum<typeof CheckOnDecrease>;
export type Config = {
    rollover?: CheckRollover | null | undefined;
    onIncrease?: CheckOnIncrease | null | undefined;
    onDecrease?: CheckOnDecrease | null | undefined;
};
/**
 * Product item defining features and pricing within a product
 */
export type CheckItem = {
    /**
     * The type of the product item
     */
    type?: ProductType | null | undefined;
    /**
     * The feature ID of the product item. If the item is a fixed price, should be `null`
     */
    featureId?: string | null | undefined;
    /**
     * Single use features are used once and then depleted, like API calls or credits. Continuous use features are those being used on an ongoing-basis, like storage or seats.
     */
    featureType?: FeatureType | null | undefined;
    /**
     * The amount of usage included for this feature.
     */
    includedUsage?: number | string | null | undefined;
    /**
     * The reset or billing interval of the product item. If null, feature will have no reset date, and if there's a price, it will be billed one-off.
     */
    interval?: CheckInterval | null | undefined;
    /**
     * The interval count of the product item.
     */
    intervalCount?: number | null | undefined;
    /**
     * The price of the product item. Should be `null` if tiered pricing is set.
     */
    price?: number | null | undefined;
    /**
     * Tiered pricing for the product item. Not applicable for fixed price items.
     */
    tiers?: Array<any | null> | null | undefined;
    /**
     * How tiers are applied: graduated (split across bands) or volume (flat rate for the matched tier). Defaults to graduated.
     */
    tierBehavior?: CheckTierBehavior | null | undefined;
    /**
     * Whether the feature should be prepaid upfront or billed for how much they use end of billing period.
     */
    usageModel?: UsageModel | null | undefined;
    /**
     * The amount per billing unit (eg. $9 / 250 units)
     */
    billingUnits?: number | null | undefined;
    /**
     * Whether the usage should be reset when the product is enabled.
     */
    resetUsageWhenEnabled?: boolean | null | undefined;
    /**
     * The entity feature ID of the product item if applicable.
     */
    entityFeatureId?: string | null | undefined;
    /**
     * The display of the product item.
     */
    display?: ProductDisplay | null | undefined;
    /**
     * Used in customer context. Quantity of the feature the customer has prepaid for.
     */
    quantity?: number | null | undefined;
    /**
     * Used in customer context. Quantity of the feature the customer will prepay for in the next cycle.
     */
    nextCycleQuantity?: number | null | undefined;
    /**
     * Configuration for rollover and proration behavior of the feature.
     */
    config?: Config | null | undefined;
};
/**
 * The duration type of the free trial
 */
export declare const FreeTrialDuration: {
    readonly Day: "day";
    readonly Month: "month";
    readonly Year: "year";
};
/**
 * The duration type of the free trial
 */
export type FreeTrialDuration = OpenEnum<typeof FreeTrialDuration>;
export type CheckFreeTrial = {
    /**
     * The duration type of the free trial
     */
    duration: FreeTrialDuration;
    /**
     * The length of the duration type specified
     */
    length: number;
    /**
     * Whether the free trial is limited to one per customer fingerprint
     */
    uniqueFingerprint: boolean;
    /**
     * Whether the free trial requires a card. If false, the customer can attach the product without going through a checkout flow or having a card on file.
     */
    cardRequired: boolean;
    /**
     * Used in customer context. Whether the free trial is available for the customer if they were to attach the product.
     */
    trialAvailable: boolean | null;
};
/**
 * Scenario for when this product is used in attach flows
 */
export declare const ProductScenario: {
    readonly Scheduled: "scheduled";
    readonly Active: "active";
    readonly New: "new";
    readonly Renew: "renew";
    readonly Upgrade: "upgrade";
    readonly Downgrade: "downgrade";
    readonly Cancel: "cancel";
    readonly Expired: "expired";
    readonly PastDue: "past_due";
};
/**
 * Scenario for when this product is used in attach flows
 */
export type ProductScenario = OpenEnum<typeof ProductScenario>;
export type CheckProperties = {
    /**
     * True if the product has no base price or usage prices
     */
    isFree: boolean;
    /**
     * True if the product only contains a one-time price
     */
    isOneOff: boolean;
    /**
     * The billing interval group for recurring products (e.g., 'monthly', 'yearly')
     */
    intervalGroup?: string | null | undefined;
    /**
     * True if the product includes a free trial
     */
    hasTrial?: boolean | null | undefined;
    /**
     * True if the product can be updated after creation (only applicable if there are prepaid recurring prices)
     */
    updateable?: boolean | null | undefined;
};
export type Product = {
    /**
     * The ID of the product you set when creating the product
     */
    id: string;
    /**
     * The name of the product
     */
    name: string;
    /**
     * Product group which this product belongs to
     */
    group: string | null;
    /**
     * The environment of the product
     */
    env: CheckEnv;
    /**
     * Whether the product is an add-on and can be purchased alongside other products
     */
    isAddOn: boolean;
    /**
     * Whether the product is the default product
     */
    isDefault: boolean;
    /**
     * Whether this product has been archived and is no longer available
     */
    archived: boolean;
    /**
     * The current version of the product
     */
    version: number;
    /**
     * The timestamp of when the product was created in milliseconds since epoch
     */
    createdAt: number;
    /**
     * Array of product items that define the product's features and pricing
     */
    items: Array<CheckItem>;
    /**
     * Free trial configuration for this product, if available
     */
    freeTrial: CheckFreeTrial | null;
    /**
     * ID of the base variant this product is derived from
     */
    baseVariantId: string | null;
    /**
     * Scenario for when this product is used in attach flows
     */
    scenario?: ProductScenario | undefined;
    properties?: CheckProperties | undefined;
};
/**
 * Upgrade/upsell information when access is denied. Only present if with_preview was true and allowed is false.
 */
export type Preview = {
    /**
     * The reason access was denied. 'usage_limit' means the customer exceeded their balance, 'feature_flag' means the feature is not included in their plan.
     */
    scenario: Scenario;
    /**
     * A title suitable for displaying in a paywall or upgrade modal.
     */
    title: string;
    /**
     * A message explaining why access was denied.
     */
    message: string;
    /**
     * The ID of the feature that was checked.
     */
    featureId: string;
    /**
     * The display name of the feature.
     */
    featureName: string;
    /**
     * Products that would grant access to this feature. Use to display upgrade options.
     */
    products: Array<Product>;
};
/**
 * OK
 */
export type CheckResponse = {
    /**
     * Whether the customer is allowed to use the feature. True if they have sufficient balance or the feature is unlimited/boolean.
     */
    allowed: boolean;
    /**
     * The ID of the customer that was checked.
     */
    customerId: string;
    /**
     * The ID of the entity, if an entity-scoped check was performed.
     */
    entityId?: string | null | undefined;
    /**
     * The required balance that was checked against.
     */
    requiredBalance?: number | undefined;
    /**
     * The customer's balance for this feature. Null if the customer has no balance for this feature.
     */
    balance: Balance | null;
    /**
     * The flag associated with this check, if any.
     */
    flag: Flag | null;
    /**
     * Upgrade/upsell information when access is denied. Only present if with_preview was true and allowed is false.
     */
    preview?: Preview | undefined;
};
/** @internal */
export type CheckLock$Outbound = {
    lock_id: string;
    enabled: true;
    expires_at?: number | undefined;
};
/** @internal */
export declare const CheckLock$outboundSchema: z.ZodMiniType<CheckLock$Outbound, CheckLock>;
export declare function checkLockToJSON(checkLock: CheckLock): string;
/** @internal */
export type CheckParams$Outbound = {
    customer_id: string;
    feature_id: string;
    entity_id?: string | undefined;
    required_balance?: number | undefined;
    properties?: {
        [k: string]: any;
    } | undefined;
    send_event?: boolean | undefined;
    lock?: CheckLock$Outbound | undefined;
    with_preview?: boolean | undefined;
};
/** @internal */
export declare const CheckParams$outboundSchema: z.ZodMiniType<CheckParams$Outbound, CheckParams>;
export declare function checkParamsToJSON(checkParams: CheckParams): string;
/** @internal */
export declare const FlagType$inboundSchema: z.ZodMiniType<FlagType, unknown>;
/** @internal */
export declare const CheckCreditSchema$inboundSchema: z.ZodMiniType<CheckCreditSchema, unknown>;
export declare function checkCreditSchemaFromJSON(jsonString: string): SafeParseResult<CheckCreditSchema, SDKValidationError>;
/** @internal */
export declare const FlagDisplay$inboundSchema: z.ZodMiniType<FlagDisplay, unknown>;
export declare function flagDisplayFromJSON(jsonString: string): SafeParseResult<FlagDisplay, SDKValidationError>;
/** @internal */
export declare const CheckFeature$inboundSchema: z.ZodMiniType<CheckFeature, unknown>;
export declare function checkFeatureFromJSON(jsonString: string): SafeParseResult<CheckFeature, SDKValidationError>;
/** @internal */
export declare const Flag$inboundSchema: z.ZodMiniType<Flag, unknown>;
export declare function flagFromJSON(jsonString: string): SafeParseResult<Flag, SDKValidationError>;
/** @internal */
export declare const Scenario$inboundSchema: z.ZodMiniType<Scenario, unknown>;
/** @internal */
export declare const CheckEnv$inboundSchema: z.ZodMiniType<CheckEnv, unknown>;
/** @internal */
export declare const ProductType$inboundSchema: z.ZodMiniType<ProductType, unknown>;
/** @internal */
export declare const FeatureType$inboundSchema: z.ZodMiniType<FeatureType, unknown>;
/** @internal */
export declare const IncludedUsage$inboundSchema: z.ZodMiniType<IncludedUsage, unknown>;
export declare function includedUsageFromJSON(jsonString: string): SafeParseResult<IncludedUsage, SDKValidationError>;
/** @internal */
export declare const CheckInterval$inboundSchema: z.ZodMiniType<CheckInterval, unknown>;
/** @internal */
export declare const CheckTierBehavior$inboundSchema: z.ZodMiniType<CheckTierBehavior, unknown>;
/** @internal */
export declare const UsageModel$inboundSchema: z.ZodMiniType<UsageModel, unknown>;
/** @internal */
export declare const ProductDisplay$inboundSchema: z.ZodMiniType<ProductDisplay, unknown>;
export declare function productDisplayFromJSON(jsonString: string): SafeParseResult<ProductDisplay, SDKValidationError>;
/** @internal */
export declare const RolloverDuration$inboundSchema: z.ZodMiniType<RolloverDuration, unknown>;
/** @internal */
export declare const CheckRollover$inboundSchema: z.ZodMiniType<CheckRollover, unknown>;
export declare function checkRolloverFromJSON(jsonString: string): SafeParseResult<CheckRollover, SDKValidationError>;
/** @internal */
export declare const CheckOnIncrease$inboundSchema: z.ZodMiniType<CheckOnIncrease, unknown>;
/** @internal */
export declare const CheckOnDecrease$inboundSchema: z.ZodMiniType<CheckOnDecrease, unknown>;
/** @internal */
export declare const Config$inboundSchema: z.ZodMiniType<Config, unknown>;
export declare function configFromJSON(jsonString: string): SafeParseResult<Config, SDKValidationError>;
/** @internal */
export declare const CheckItem$inboundSchema: z.ZodMiniType<CheckItem, unknown>;
export declare function checkItemFromJSON(jsonString: string): SafeParseResult<CheckItem, SDKValidationError>;
/** @internal */
export declare const FreeTrialDuration$inboundSchema: z.ZodMiniType<FreeTrialDuration, unknown>;
/** @internal */
export declare const CheckFreeTrial$inboundSchema: z.ZodMiniType<CheckFreeTrial, unknown>;
export declare function checkFreeTrialFromJSON(jsonString: string): SafeParseResult<CheckFreeTrial, SDKValidationError>;
/** @internal */
export declare const ProductScenario$inboundSchema: z.ZodMiniType<ProductScenario, unknown>;
/** @internal */
export declare const CheckProperties$inboundSchema: z.ZodMiniType<CheckProperties, unknown>;
export declare function checkPropertiesFromJSON(jsonString: string): SafeParseResult<CheckProperties, SDKValidationError>;
/** @internal */
export declare const Product$inboundSchema: z.ZodMiniType<Product, unknown>;
export declare function productFromJSON(jsonString: string): SafeParseResult<Product, SDKValidationError>;
/** @internal */
export declare const Preview$inboundSchema: z.ZodMiniType<Preview, unknown>;
export declare function previewFromJSON(jsonString: string): SafeParseResult<Preview, SDKValidationError>;
/** @internal */
export declare const CheckResponse$inboundSchema: z.ZodMiniType<CheckResponse, unknown>;
export declare function checkResponseFromJSON(jsonString: string): SafeParseResult<CheckResponse, SDKValidationError>;
