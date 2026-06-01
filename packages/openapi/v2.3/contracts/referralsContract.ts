import {
	CreateReferralCodeParamsSchema,
	CreateReferralCodeResponseSchema,
	RedeemReferralCodeParamsSchema,
	RedeemReferralCodeResponseSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";

const RedeemRewardCodeParamsSchema = z.object({
	code: z.string().meta({
		description: "The reward promo code to redeem",
		example: "REWARD10",
	}),
	customer_id: z.string().meta({
		description: "The unique identifier of the customer redeeming the code",
		example: "cus_456",
	}),
});

const RedeemRewardCodeResponseSchema = z.object({
	reward_id: z.string().meta({
		description: "The ID of the redeemed reward",
		example: "reward_789",
	}),
	entitlements_granted: z
		.array(
			z.object({
				feature_id: z.string().meta({
					description: "The ID of the feature granted by the reward",
					example: "messages",
				}),
				balance: z.number().meta({
					description: "The balance granted for the feature",
					example: 100,
				}),
			}),
		)
		.meta({
			description: "The feature balances granted to the customer",
		}),
});

export const referralsCreateCodeContract = oc
	.route({
		method: "POST",
		path: "/v1/referrals.create_code",
		operationId: "createReferralCode",
		tags: ["referrals"],
		description:
			"Create or fetch a referral code for a customer in a referral program.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "createCode",
		}),
	})
	.input(
		CreateReferralCodeParamsSchema.meta({
			title: "CreateReferralCodeParams",
			examples: [
				{
					customer_id: "cus_123",
					program_id: "prog_123",
				},
			],
		}),
	)
	.output(
		CreateReferralCodeResponseSchema.meta({
			examples: [
				{
					code: "<string>",
					customer_id: "<string>",
					created_at: 123,
				},
			],
		}),
	);

export const referralsRedeemCodeContract = oc
	.route({
		method: "POST",
		path: "/v1/referrals.redeem_code",
		operationId: "redeemReferralCode",
		tags: ["referrals"],
		description: "Redeem a referral code for a customer.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "redeemCode",
		}),
	})
	.input(
		RedeemReferralCodeParamsSchema.meta({
			title: "RedeemReferralCodeParams",
			examples: [
				{
					code: "REF123",
					customer_id: "cus_456",
				},
			],
		}),
	)
	.output(
		RedeemReferralCodeResponseSchema.meta({
			examples: [
				{
					id: "<string>",
					customer_id: "<string>",
					reward_id: "<string>",
				},
			],
		}),
	);

export const rewardsRedeemCodeContract = oc
	.route({
		method: "POST",
		path: "/v1/rewards.redeem",
		operationId: "redeemRewardCode",
		tags: ["rewards"],
		description: "Redeem a reward promo code for a customer.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "redeemCode",
		}),
	})
	.input(
		RedeemRewardCodeParamsSchema.meta({
			title: "RedeemRewardCodeParams",
			examples: [
				{
					code: "REWARD10",
					customer_id: "cus_456",
				},
			],
		}),
	)
	.output(
		RedeemRewardCodeResponseSchema.meta({
			examples: [
				{
					reward_id: "reward_789",
					entitlements_granted: [
						{
							feature_id: "messages",
							balance: 100,
						},
					],
				},
			],
		}),
	);
