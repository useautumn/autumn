import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type CreateBalanceGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * The interval at which the balance resets (e.g., 'month', 'day', 'year').
 */
export declare const CreateBalanceInterval: {
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
 * The interval at which the balance resets (e.g., 'month', 'day', 'year').
 */
export type CreateBalanceInterval = ClosedEnum<typeof CreateBalanceInterval>;
/**
 * Reset configuration for the balance. If not provided, the balance is a one-time grant that never resets.
 */
export type CreateBalanceReset = {
    /**
     * The interval at which the balance resets (e.g., 'month', 'day', 'year').
     */
    interval: CreateBalanceInterval;
    /**
     * Number of intervals between resets. Defaults to 1 (e.g., interval_count: 2 with interval: 'month' resets every 2 months).
     */
    intervalCount?: number | undefined;
};
export type CreateBalanceParams = {
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
     * The initial balance amount to grant. For metered features, this is the number of units the customer can use.
     */
    includedGrant?: number | undefined;
    /**
     * If true, the balance has unlimited usage. Cannot be combined with 'included_grant'.
     */
    unlimited?: boolean | undefined;
    /**
     * Reset configuration for the balance. If not provided, the balance is a one-time grant that never resets.
     */
    reset?: CreateBalanceReset | undefined;
    /**
     * Unix timestamp (milliseconds) when the balance expires. Mutually exclusive with reset.
     */
    expiresAt?: number | undefined;
    /**
     * A unique identifier for this balance. Use this to target the balance in future update / delete calls.
     */
    balanceId?: string | undefined;
};
/**
 * OK
 */
export type CreateBalanceResponse = {
    success: boolean;
};
/** @internal */
export declare const CreateBalanceInterval$outboundSchema: z.ZodMiniEnum<typeof CreateBalanceInterval>;
/** @internal */
export type CreateBalanceReset$Outbound = {
    interval: string;
    interval_count?: number | undefined;
};
/** @internal */
export declare const CreateBalanceReset$outboundSchema: z.ZodMiniType<CreateBalanceReset$Outbound, CreateBalanceReset>;
export declare function createBalanceResetToJSON(createBalanceReset: CreateBalanceReset): string;
/** @internal */
export type CreateBalanceParams$Outbound = {
    customer_id: string;
    feature_id: string;
    entity_id?: string | undefined;
    included_grant?: number | undefined;
    unlimited?: boolean | undefined;
    reset?: CreateBalanceReset$Outbound | undefined;
    expires_at?: number | undefined;
    balance_id?: string | undefined;
};
/** @internal */
export declare const CreateBalanceParams$outboundSchema: z.ZodMiniType<CreateBalanceParams$Outbound, CreateBalanceParams>;
export declare function createBalanceParamsToJSON(createBalanceParams: CreateBalanceParams): string;
/** @internal */
export declare const CreateBalanceResponse$inboundSchema: z.ZodMiniType<CreateBalanceResponse, unknown>;
export declare function createBalanceResponseFromJSON(jsonString: string): SafeParseResult<CreateBalanceResponse, SDKValidationError>;
