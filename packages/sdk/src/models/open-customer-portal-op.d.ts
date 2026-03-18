import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type OpenCustomerPortalGlobals = {
    xApiVersion?: string | undefined;
};
export type OpenCustomerPortalParams = {
    /**
     * The ID of the customer to open the billing portal for.
     */
    customerId: string;
    /**
     * Stripe billing portal configuration ID. Create configurations in your Stripe dashboard.
     */
    configurationId?: string | undefined;
    /**
     * URL to redirect to when back button is clicked in the billing portal
     */
    returnUrl?: string | undefined;
};
/**
 * OK
 */
export type OpenCustomerPortalResponse = {
    /**
     * The ID of the billing portal session
     */
    customerId: string;
    /**
     * URL to the billing portal
     */
    url: string;
};
/** @internal */
export type OpenCustomerPortalParams$Outbound = {
    customer_id: string;
    configuration_id?: string | undefined;
    return_url?: string | undefined;
};
/** @internal */
export declare const OpenCustomerPortalParams$outboundSchema: z.ZodMiniType<OpenCustomerPortalParams$Outbound, OpenCustomerPortalParams>;
export declare function openCustomerPortalParamsToJSON(openCustomerPortalParams: OpenCustomerPortalParams): string;
/** @internal */
export declare const OpenCustomerPortalResponse$inboundSchema: z.ZodMiniType<OpenCustomerPortalResponse, unknown>;
export declare function openCustomerPortalResponseFromJSON(jsonString: string): SafeParseResult<OpenCustomerPortalResponse, SDKValidationError>;
