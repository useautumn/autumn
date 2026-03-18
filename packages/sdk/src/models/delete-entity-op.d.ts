import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type DeleteEntityGlobals = {
    xApiVersion?: string | undefined;
};
export type DeleteEntityParams = {
    /**
     * The ID of the customer.
     */
    customerId?: string | undefined;
    /**
     * The ID of the entity.
     */
    entityId: string;
};
/**
 * OK
 */
export type DeleteEntityResponse = {
    success: boolean;
};
/** @internal */
export type DeleteEntityParams$Outbound = {
    customer_id?: string | undefined;
    entity_id: string;
};
/** @internal */
export declare const DeleteEntityParams$outboundSchema: z.ZodMiniType<DeleteEntityParams$Outbound, DeleteEntityParams>;
export declare function deleteEntityParamsToJSON(deleteEntityParams: DeleteEntityParams): string;
/** @internal */
export declare const DeleteEntityResponse$inboundSchema: z.ZodMiniType<DeleteEntityResponse, unknown>;
export declare function deleteEntityResponseFromJSON(jsonString: string): SafeParseResult<DeleteEntityResponse, SDKValidationError>;
