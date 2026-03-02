import {
	CreateReferralCodeParamsSchema,
	CreateReferralCodeResponseSchema,
	RedeemReferralCodeParamsSchema,
	RedeemReferralCodeResponseSchema,
} from "@autumn/shared";
import type { ZodOpenApiPathsObject } from "zod-openapi";

const ReferralCodeSchema = CreateReferralCodeResponseSchema.meta({
	id: "ReferralCode",
	description: "Referral code object returned by the API",
});

const RedeemReferralCodeResponseSchemaWithMeta =
	RedeemReferralCodeResponseSchema.meta({
		id: "RedeemReferralCodeResponse",
		description: "Redemption response object returned by the API",
	});

export const referralOps: ZodOpenApiPathsObject = {
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
						"application/json": {
							schema: ReferralCodeSchema,
						},
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
						"application/json": {
							schema: RedeemReferralCodeResponseSchemaWithMeta,
						},
					},
				},
			},
		},
	},
};
