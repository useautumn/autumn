import { ClientSDK, RequestOptions } from "../lib/sdks.js";
import * as models from "../models/index.js";
export declare class Referrals extends ClientSDK {
    /**
     * Create or fetch a referral code for a customer in a referral program.
     */
    createCode(request: models.CreateReferralCodeParams, options?: RequestOptions): Promise<models.CreateReferralCodeResponse>;
    /**
     * Redeem a referral code for a customer.
     */
    redeemCode(request: models.RedeemReferralCodeParams, options?: RequestOptions): Promise<models.RedeemReferralCodeResponse>;
}
