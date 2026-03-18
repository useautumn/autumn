import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const BalanceType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type BalanceType = OpenEnum<typeof BalanceType>;
export type BalanceCreditSchema = {
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
export type BalanceDisplay = {
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
export type BalanceFeature = {
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
    type: BalanceType;
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
    creditSchema?: Array<BalanceCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: BalanceDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export declare const BalanceIntervalEnum: {
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
export type BalanceIntervalEnum = OpenEnum<typeof BalanceIntervalEnum>;
/**
 * The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals.
 */
export type Interval = BalanceIntervalEnum | string;
export type BalanceReset = {
    /**
     * The reset interval (hour, day, week, month, etc.) or 'multiple' if combined from different intervals.
     */
    interval: BalanceIntervalEnum | string;
    /**
     * Number of intervals between resets (eg. 2 for bi-monthly).
     */
    intervalCount?: number | undefined;
    /**
     * Timestamp when the balance will next reset.
     */
    resetsAt: number | null;
};
/**
 * How tiers are applied: graduated (split across bands) or volume (flat rate for the matched tier).
 */
export declare const BalanceTierBehavior: {
    readonly Graduated: "graduated";
    readonly Volume: "volume";
};
/**
 * How tiers are applied: graduated (split across bands) or volume (flat rate for the matched tier).
 */
export type BalanceTierBehavior = OpenEnum<typeof BalanceTierBehavior>;
/**
 * Whether usage is prepaid or billed pay-per-use.
 */
export declare const BalanceBillingMethod: {
    readonly Prepaid: "prepaid";
    readonly UsageBased: "usage_based";
};
/**
 * Whether usage is prepaid or billed pay-per-use.
 */
export type BalanceBillingMethod = OpenEnum<typeof BalanceBillingMethod>;
export type BalancePrice = {
    /**
     * The per-unit price amount.
     */
    amount?: number | undefined;
    /**
     * Tiered pricing configuration if applicable.
     */
    tiers?: Array<any | null> | undefined;
    /**
     * How tiers are applied: graduated (split across bands) or volume (flat rate for the matched tier).
     */
    tierBehavior?: BalanceTierBehavior | undefined;
    /**
     * The number of units per billing increment (eg. $9 / 250 units).
     */
    billingUnits: number;
    /**
     * Whether usage is prepaid or billed pay-per-use.
     */
    billingMethod: BalanceBillingMethod;
    /**
     * Maximum quantity that can be purchased, or null for unlimited.
     */
    maxPurchase: number | null;
};
export type Breakdown = {
    /**
     * The unique identifier for this balance breakdown.
     */
    id: string;
    /**
     * The plan ID this balance originates from, or null for standalone balances.
     */
    planId: string | null;
    /**
     * Amount granted from the plan's included usage.
     */
    includedGrant: number;
    /**
     * Amount granted from prepaid purchases or top-ups.
     */
    prepaidGrant: number;
    /**
     * Remaining balance available for use.
     */
    remaining: number;
    /**
     * Amount consumed in the current period.
     */
    usage: number;
    /**
     * Whether this balance has unlimited usage.
     */
    unlimited: boolean;
    /**
     * Reset configuration for this balance, or null if no reset.
     */
    reset: BalanceReset | null;
    /**
     * Pricing configuration if this balance has usage-based pricing.
     */
    price: BalancePrice | null;
    /**
     * Timestamp when this balance expires, or null for no expiration.
     */
    expiresAt: number | null;
};
export type BalanceRollover = {
    /**
     * Amount of balance rolled over from a previous period.
     */
    balance: number;
    /**
     * Timestamp when the rollover balance expires.
     */
    expiresAt: number;
};
export type Balance = {
    /**
     * The feature ID this balance is for.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: BalanceFeature | undefined;
    /**
     * Total balance granted (included + prepaid).
     */
    granted: number;
    /**
     * Remaining balance available for use.
     */
    remaining: number;
    /**
     * Total usage consumed in the current period.
     */
    usage: number;
    /**
     * Whether this feature has unlimited usage.
     */
    unlimited: boolean;
    /**
     * Whether usage beyond the granted balance is allowed (with overage charges).
     */
    overageAllowed: boolean;
    /**
     * Maximum quantity that can be purchased as a top-up, or null for unlimited.
     */
    maxPurchase: number | null;
    /**
     * Timestamp when the balance will reset, or null for no reset.
     */
    nextResetAt: number | null;
    /**
     * Detailed breakdown of balance sources when stacking multiple plans or grants.
     */
    breakdown?: Array<Breakdown> | undefined;
    /**
     * Rollover balances carried over from previous periods.
     */
    rollovers?: Array<BalanceRollover> | undefined;
};
/** @internal */
export declare const BalanceType$inboundSchema: z.ZodMiniType<BalanceType, unknown>;
/** @internal */
export declare const BalanceCreditSchema$inboundSchema: z.ZodMiniType<BalanceCreditSchema, unknown>;
export declare function balanceCreditSchemaFromJSON(jsonString: string): SafeParseResult<BalanceCreditSchema, SDKValidationError>;
/** @internal */
export declare const BalanceDisplay$inboundSchema: z.ZodMiniType<BalanceDisplay, unknown>;
export declare function balanceDisplayFromJSON(jsonString: string): SafeParseResult<BalanceDisplay, SDKValidationError>;
/** @internal */
export declare const BalanceFeature$inboundSchema: z.ZodMiniType<BalanceFeature, unknown>;
export declare function balanceFeatureFromJSON(jsonString: string): SafeParseResult<BalanceFeature, SDKValidationError>;
/** @internal */
export declare const BalanceIntervalEnum$inboundSchema: z.ZodMiniType<BalanceIntervalEnum, unknown>;
/** @internal */
export declare const Interval$inboundSchema: z.ZodMiniType<Interval, unknown>;
export declare function intervalFromJSON(jsonString: string): SafeParseResult<Interval, SDKValidationError>;
/** @internal */
export declare const BalanceReset$inboundSchema: z.ZodMiniType<BalanceReset, unknown>;
export declare function balanceResetFromJSON(jsonString: string): SafeParseResult<BalanceReset, SDKValidationError>;
/** @internal */
export declare const BalanceTierBehavior$inboundSchema: z.ZodMiniType<BalanceTierBehavior, unknown>;
/** @internal */
export declare const BalanceBillingMethod$inboundSchema: z.ZodMiniType<BalanceBillingMethod, unknown>;
/** @internal */
export declare const BalancePrice$inboundSchema: z.ZodMiniType<BalancePrice, unknown>;
export declare function balancePriceFromJSON(jsonString: string): SafeParseResult<BalancePrice, SDKValidationError>;
/** @internal */
export declare const Breakdown$inboundSchema: z.ZodMiniType<Breakdown, unknown>;
export declare function breakdownFromJSON(jsonString: string): SafeParseResult<Breakdown, SDKValidationError>;
/** @internal */
export declare const BalanceRollover$inboundSchema: z.ZodMiniType<BalanceRollover, unknown>;
export declare function balanceRolloverFromJSON(jsonString: string): SafeParseResult<BalanceRollover, SDKValidationError>;
/** @internal */
export declare const Balance$inboundSchema: z.ZodMiniType<Balance, unknown>;
export declare function balanceFromJSON(jsonString: string): SafeParseResult<Balance, SDKValidationError>;
