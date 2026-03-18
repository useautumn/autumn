import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type UpdateBalanceGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.
 */
export declare const UpdateBalanceInterval: {
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
 * Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.
 */
export type UpdateBalanceInterval = ClosedEnum<typeof UpdateBalanceInterval>;
export type UpdateBalanceParams = {
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
     * Set the remaining balance to this exact value. Cannot be combined with add_to_balance.
     */
    remaining?: number | undefined;
    /**
     * Add this amount to the current balance. Use negative values to subtract. Cannot be combined with current_balance.
     */
    addToBalance?: number | undefined;
    /**
     * The usage amount to update. Cannot be combined with remaining or add_to_balance.
     */
    usage?: number | undefined;
    /**
     * Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.
     */
    interval?: UpdateBalanceInterval | undefined;
    /**
     * Set the granted balance to this exact value.
     */
    includedGrant?: number | undefined;
    /**
     * Target a specific balance by its ID (set on create). Use when the customer has multiple balances for the same feature.
     */
    balanceId?: string | undefined;
    /**
     * The next reset time for the balance. If there are multiple breakdowns, this will update the breakdown with the next reset time.
     */
    nextResetAt?: number | undefined;
};
/**
 * OK
 */
export type UpdateBalanceResponse = {
    success: boolean;
};
/** @internal */
export declare const UpdateBalanceInterval$outboundSchema: z.ZodMiniEnum<typeof UpdateBalanceInterval>;
/** @internal */
export type UpdateBalanceParams$Outbound = {
    customer_id: string;
    feature_id: string;
    entity_id?: string | undefined;
    remaining?: number | undefined;
    add_to_balance?: number | undefined;
    usage?: number | undefined;
    interval?: string | undefined;
    included_grant?: number | undefined;
    balance_id?: string | undefined;
    next_reset_at?: number | undefined;
};
/** @internal */
export declare const UpdateBalanceParams$outboundSchema: z.ZodMiniType<UpdateBalanceParams$Outbound, UpdateBalanceParams>;
export declare function updateBalanceParamsToJSON(updateBalanceParams: UpdateBalanceParams): string;
/** @internal */
export declare const UpdateBalanceResponse$inboundSchema: z.ZodMiniType<UpdateBalanceResponse, unknown>;
export declare function updateBalanceResponseFromJSON(jsonString: string): SafeParseResult<UpdateBalanceResponse, SDKValidationError>;
