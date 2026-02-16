// Auto-generated Zod schema
import { z } from "zod";

export const ReferralCreateCodeParamsSchema = z.object({
	programId: z.string().describe("ID of your referral program"),
});

export interface ReferralCreateCodeParams {
	/**
	 * ID of your referral program
	 */
	programId: string;
}
