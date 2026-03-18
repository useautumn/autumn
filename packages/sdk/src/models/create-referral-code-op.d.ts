import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type CreateReferralCodeGlobals = {
    xApiVersion?: string | undefined;
};
export type CreateReferralCodeParams = {
    /**
     * The unique identifier of the customer
     */
    customerId: string;
    /**
     * ID of your referral program
     */
    programId: string;
};
/**
 * OK
 */
export type CreateReferralCodeResponse = {
    /**
     * The referral code that can be shared with customers
     */
    code: string;
    /**
     * Your unique identifier for the customer
     */
    customerId: string;
    /**
     * The timestamp of when the referral code was created
     */
    createdAt: number;
};
/** @internal */
export type CreateReferralCodeParams$Outbound = {
    customer_id: string;
    program_id: string;
};
/** @internal */
export declare const CreateReferralCodeParams$outboundSchema: z.ZodMiniType<CreateReferralCodeParams$Outbound, CreateReferralCodeParams>;
export declare function createReferralCodeParamsToJSON(createReferralCodeParams: CreateReferralCodeParams): string;
/** @internal */
export declare const CreateReferralCodeResponse$inboundSchema: z.ZodMiniType<CreateReferralCodeResponse, unknown>;
export declare function createReferralCodeResponseFromJSON(jsonString: string): SafeParseResult<CreateReferralCodeResponse, SDKValidationError>;
