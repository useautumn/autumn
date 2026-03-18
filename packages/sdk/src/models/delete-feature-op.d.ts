import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type DeleteFeatureGlobals = {
    xApiVersion?: string | undefined;
};
export type DeleteFeatureParams = {
    /**
     * The ID of the feature to delete.
     */
    featureId: string;
};
/**
 * OK
 */
export type DeleteFeatureResponse = {
    success: boolean;
};
/** @internal */
export type DeleteFeatureParams$Outbound = {
    feature_id: string;
};
/** @internal */
export declare const DeleteFeatureParams$outboundSchema: z.ZodMiniType<DeleteFeatureParams$Outbound, DeleteFeatureParams>;
export declare function deleteFeatureParamsToJSON(deleteFeatureParams: DeleteFeatureParams): string;
/** @internal */
export declare const DeleteFeatureResponse$inboundSchema: z.ZodMiniType<DeleteFeatureResponse, unknown>;
export declare function deleteFeatureResponseFromJSON(jsonString: string): SafeParseResult<DeleteFeatureResponse, SDKValidationError>;
