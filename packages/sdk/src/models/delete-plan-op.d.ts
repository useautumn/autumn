import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type DeletePlanGlobals = {
    xApiVersion?: string | undefined;
};
export type DeletePlanParams = {
    /**
     * The ID of the plan to delete.
     */
    planId: string;
    /**
     * If true, deletes all versions of the plan. Otherwise, only deletes the latest version.
     */
    allVersions?: boolean | undefined;
};
/**
 * OK
 */
export type DeletePlanResponse = {
    success: boolean;
};
/** @internal */
export type DeletePlanParams$Outbound = {
    plan_id: string;
    all_versions: boolean;
};
/** @internal */
export declare const DeletePlanParams$outboundSchema: z.ZodMiniType<DeletePlanParams$Outbound, DeletePlanParams>;
export declare function deletePlanParamsToJSON(deletePlanParams: DeletePlanParams): string;
/** @internal */
export declare const DeletePlanResponse$inboundSchema: z.ZodMiniType<DeletePlanResponse, unknown>;
export declare function deletePlanResponseFromJSON(jsonString: string): SafeParseResult<DeletePlanResponse, SDKValidationError>;
