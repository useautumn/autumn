import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type DeleteBalanceGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.
 */
export declare const DeleteBalanceInterval: {
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
export type DeleteBalanceInterval = ClosedEnum<typeof DeleteBalanceInterval>;
export type DeleteBalanceParams = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * The ID of the entity.
     */
    entityId?: string | undefined;
    /**
     * The ID of the feature.
     */
    featureId?: string | undefined;
    /**
     * The ID of the balance to delete.
     */
    balanceId?: string | undefined;
    /**
     * Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.
     */
    interval?: DeleteBalanceInterval | undefined;
};
/**
 * OK
 */
export type DeleteBalanceResponse = {
    success: boolean;
};
/** @internal */
export declare const DeleteBalanceInterval$outboundSchema: z.ZodMiniEnum<typeof DeleteBalanceInterval>;
/** @internal */
export type DeleteBalanceParams$Outbound = {
    customer_id: string;
    entity_id?: string | undefined;
    feature_id?: string | undefined;
    balance_id?: string | undefined;
    interval?: string | undefined;
};
/** @internal */
export declare const DeleteBalanceParams$outboundSchema: z.ZodMiniType<DeleteBalanceParams$Outbound, DeleteBalanceParams>;
export declare function deleteBalanceParamsToJSON(deleteBalanceParams: DeleteBalanceParams): string;
/** @internal */
export declare const DeleteBalanceResponse$inboundSchema: z.ZodMiniType<DeleteBalanceResponse, unknown>;
export declare function deleteBalanceResponseFromJSON(jsonString: string): SafeParseResult<DeleteBalanceResponse, SDKValidationError>;
