import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type DeleteCustomerGlobals = {
    xApiVersion?: string | undefined;
};
export type DeleteCustomerParams = {
    /**
     * ID of the customer to delete
     */
    customerId: string;
    /**
     * Whether to also delete the customer in Stripe
     */
    deleteInStripe?: boolean | undefined;
};
/**
 * OK
 */
export type DeleteCustomerResponse = {
    success: boolean;
};
/** @internal */
export type DeleteCustomerParams$Outbound = {
    customer_id: string;
    delete_in_stripe: boolean;
};
/** @internal */
export declare const DeleteCustomerParams$outboundSchema: z.ZodMiniType<DeleteCustomerParams$Outbound, DeleteCustomerParams>;
export declare function deleteCustomerParamsToJSON(deleteCustomerParams: DeleteCustomerParams): string;
/** @internal */
export declare const DeleteCustomerResponse$inboundSchema: z.ZodMiniType<DeleteCustomerResponse, unknown>;
export declare function deleteCustomerResponseFromJSON(jsonString: string): SafeParseResult<DeleteCustomerResponse, SDKValidationError>;
