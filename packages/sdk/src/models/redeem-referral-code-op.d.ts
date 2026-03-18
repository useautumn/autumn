import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type RedeemReferralCodeGlobals = {
    xApiVersion?: string | undefined;
};
export type RedeemReferralCodeParams = {
    /**
     * The referral code to redeem
     */
    code: string;
    /**
     * The unique identifier of the customer redeeming the code
     */
    customerId: string;
};
/**
 * OK
 */
export type RedeemReferralCodeResponse = {
    /**
     * The ID of the redemption event
     */
    id: string;
    /**
     * Your unique identifier for the customer
     */
    customerId: string;
    /**
     * The ID of the reward that will be granted
     */
    rewardId: string;
};
/** @internal */
export type RedeemReferralCodeParams$Outbound = {
    code: string;
    customer_id: string;
};
/** @internal */
export declare const RedeemReferralCodeParams$outboundSchema: z.ZodMiniType<RedeemReferralCodeParams$Outbound, RedeemReferralCodeParams>;
export declare function redeemReferralCodeParamsToJSON(redeemReferralCodeParams: RedeemReferralCodeParams): string;
/** @internal */
export declare const RedeemReferralCodeResponse$inboundSchema: z.ZodMiniType<RedeemReferralCodeResponse, unknown>;
export declare function redeemReferralCodeResponseFromJSON(jsonString: string): SafeParseResult<RedeemReferralCodeResponse, SDKValidationError>;
