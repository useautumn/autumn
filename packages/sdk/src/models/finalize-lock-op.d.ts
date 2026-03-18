import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type FinalizeLockGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Use 'confirm' to commit the deduction, or 'release' to return the held balance.
 */
export declare const Action: {
    readonly Confirm: "confirm";
    readonly Release: "release";
};
/**
 * Use 'confirm' to commit the deduction, or 'release' to return the held balance.
 */
export type Action = ClosedEnum<typeof Action>;
export type FinalizeBalanceParams = {
    /**
     * The lock ID that was passed into the previous check call.
     */
    lockId: string;
    /**
     * Use 'confirm' to commit the deduction, or 'release' to return the held balance.
     */
    action: Action;
    /**
     * Additional properties to attach to this finalize lock event.
     */
    overrideValue?: number | undefined;
    /**
     * Additional properties to attach to this finalize lock event.
     */
    properties?: {
        [k: string]: any;
    } | undefined;
};
/**
 * OK
 */
export type FinalizeLockResponse = {
    success: boolean;
};
/** @internal */
export declare const Action$outboundSchema: z.ZodMiniEnum<typeof Action>;
/** @internal */
export type FinalizeBalanceParams$Outbound = {
    lock_id: string;
    action: string;
    override_value?: number | undefined;
    properties?: {
        [k: string]: any;
    } | undefined;
};
/** @internal */
export declare const FinalizeBalanceParams$outboundSchema: z.ZodMiniType<FinalizeBalanceParams$Outbound, FinalizeBalanceParams>;
export declare function finalizeBalanceParamsToJSON(finalizeBalanceParams: FinalizeBalanceParams): string;
/** @internal */
export declare const FinalizeLockResponse$inboundSchema: z.ZodMiniType<FinalizeLockResponse, unknown>;
export declare function finalizeLockResponseFromJSON(jsonString: string): SafeParseResult<FinalizeLockResponse, SDKValidationError>;
