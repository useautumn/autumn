import {
	CreateReferralCodeResponseSchema,
	RedeemReferralCodeResponseSchema,
} from "./apiReferralCode.js";
import {
	CreateReferralCodeParamsSchema,
	RedeemReferralCodeParamsSchema,
} from "./referralOpModels.js";

export const referralOps = {
	"/referrals/code": {
		post: {
			summary: "Create a referral code",
			tags: ["referrals"],
			requestBody: {
				content: {
					"application/json": { schema: CreateReferralCodeParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "Referral code generated successfully",
					content: {
						"application/json": { schema: CreateReferralCodeResponseSchema },
					},
				},
			},
		},
	},
	"/referrals/redeem": {
		post: {
			summary: "Redeem a referral code",
			tags: ["referrals"],
			requestBody: {
				content: {
					"application/json": { schema: RedeemReferralCodeParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "Referral code redeemed successfully",
					content: {
						"application/json": { schema: RedeemReferralCodeResponseSchema },
					},
				},
			},
		},
	},
};
