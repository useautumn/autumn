import {
	ApiRewardsListV0Schema,
	CreateReferralCodeParamsSchema,
	CreateReferralCodeResponseSchema,
	CreateReferralProgramParamsSchema,
	CreateReferralProgramResponseSchema,
	CreateRewardParamsSchema,
	CreateRewardResponseSchema,
	DeleteReferralProgramParamsSchema,
	DeleteReferralProgramResponseSchema,
	DeleteRewardParamsSchema,
	DeleteRewardResponseSchema,
	GetReferralProgramParamsSchema,
	GetReferralProgramResponseSchema,
	GetRewardParamsSchema,
	GetRewardResponseSchema,
	RedeemReferralCodeParamsSchema,
	RedeemReferralCodeResponseSchema,
	ReferralProgramsListParamsSchema,
	ReferralProgramsListResponseSchema,
	RewardsListParamsSchema,
	UpdateReferralProgramParamsSchema,
	UpdateReferralProgramResponseSchema,
	UpdateRewardParamsSchema,
	UpdateRewardResponseSchema,
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

export const rewardsListContract = oc
	.route({
		method: "POST",
		path: "/v1/rewards.list",
		operationId: "listRewards",
		tags: ["rewards"],
		description: "List the coupons and feature grants configured for the org.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		RewardsListParamsSchema.meta({
			title: "RewardsListParams",
			examples: [{}],
		}),
	)
	.output(
		ApiRewardsListV0Schema.meta({
			examples: [
				{
					coupons: [],
					feature_grants: [],
				},
			],
		}),
	);

export const rewardsCreateContract = oc
	.route({
		method: "POST",
		path: "/v1/rewards.create",
		operationId: "createReward",
		tags: ["rewards"],
		description: "Create a coupon or feature grant.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(
		CreateRewardParamsSchema.meta({
			title: "CreateRewardParams",
			examples: [
				{
					coupon: {
						id: "summer_sale",
						name: "Summer Sale",
						type: "percentage_discount",
						value: 20,
						duration: { type: "months", length: 3 },
						plan_ids: null,
						promo_codes: [{ code: "SUMMER20" }],
					},
				},
			],
		}),
	)
	.output(CreateRewardResponseSchema);

export const referralProgramsCreateContract = oc
	.route({
		method: "POST",
		path: "/v1/referral_programs.create",
		operationId: "createReferralProgram",
		tags: ["referrals"],
		description: "Create a referral program linked to an existing reward.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "createProgram",
		}),
	})
	.input(
		CreateReferralProgramParamsSchema.meta({
			title: "CreateReferralProgramParams",
		}),
	)
	.output(CreateReferralProgramResponseSchema);

export const referralProgramsListContract = oc
	.route({
		method: "POST",
		path: "/v1/referral_programs.list",
		operationId: "listReferralPrograms",
		tags: ["referrals"],
		description: "List the referral programs configured for the org.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "listPrograms",
		}),
	})
	.input(
		ReferralProgramsListParamsSchema.meta({
			title: "ListReferralProgramsParams",
			examples: [{}],
		}),
	)
	.output(ReferralProgramsListResponseSchema);

export const referralProgramsGetContract = oc
	.route({
		method: "POST",
		path: "/v1/referral_programs.get",
		operationId: "getReferralProgram",
		tags: ["referrals"],
		description: "Fetch a referral program by ID.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "getProgram",
		}),
	})
	.input(GetReferralProgramParamsSchema)
	.output(GetReferralProgramResponseSchema);

export const referralProgramsUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/referral_programs.update",
		operationId: "updateReferralProgram",
		tags: ["referrals"],
		description:
			"Update a referral program. Omitted fields keep their current value.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "updateProgram",
		}),
	})
	.input(UpdateReferralProgramParamsSchema)
	.output(UpdateReferralProgramResponseSchema);

export const referralProgramsDeleteContract = oc
	.route({
		method: "POST",
		path: "/v1/referral_programs.delete",
		operationId: "deleteReferralProgram",
		tags: ["referrals"],
		description: "Delete a referral program.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "deleteProgram",
		}),
	})
	.input(DeleteReferralProgramParamsSchema)
	.output(DeleteReferralProgramResponseSchema);

export const rewardsGetContract = oc
	.route({
		method: "POST",
		path: "/v1/rewards.get",
		operationId: "getReward",
		tags: ["rewards"],
		description: "Fetch a coupon or feature grant by ID.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "get",
		}),
	})
	.input(GetRewardParamsSchema)
	.output(GetRewardResponseSchema);

export const rewardsUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/rewards.update",
		operationId: "updateReward",
		tags: ["rewards"],
		description:
			"Update a coupon or feature grant. Omitted fields keep their current value.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(UpdateRewardParamsSchema)
	.output(UpdateRewardResponseSchema);

export const rewardsDeleteContract = oc
	.route({
		method: "POST",
		path: "/v1/rewards.delete",
		operationId: "deleteReward",
		tags: ["rewards"],
		description: "Delete a coupon or feature grant.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(DeleteRewardParamsSchema)
	.output(DeleteRewardResponseSchema);

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
