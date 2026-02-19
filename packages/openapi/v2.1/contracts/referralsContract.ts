import {
	CreateReferralCodeParamsSchema,
	CreateReferralCodeResponseSchema,
	RedeemReferralCodeParamsSchema,
	RedeemReferralCodeResponseSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";

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
