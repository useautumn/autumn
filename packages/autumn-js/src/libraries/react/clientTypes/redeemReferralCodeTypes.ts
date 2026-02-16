// Auto-generated Zod schema
import { z } from "zod";

export const ReferralRedeemCodeParamsSchema = z.object({
	code: z.string().describe("The referral code to redeem"),
});

export interface ReferralRedeemCodeParams {
	/**
	 * The referral code to redeem
	 */
	code: string;
}
