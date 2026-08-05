import { RewardTriggerEvent } from "@models/rewardModels/rewardProgramModels/rewardProgramEnums.js";
import { z } from "zod/v4";
import { getListResponseSchema } from "../common/commonResponses.js";
import {
	ApiReferralProgramV0Schema,
	REFERRAL_PROGRAM_V0_EXAMPLE,
} from "./components/apiReferralProgramV0.js";

export const ReferralProgramsListParamsSchema = z.object({}).optional();

export const ReferralProgramsListResponseSchema = getListResponseSchema({
	schema: ApiReferralProgramV0Schema,
}).meta({
	title: "ListReferralProgramsResponse",
	examples: [{ list: [REFERRAL_PROGRAM_V0_EXAMPLE] }],
});

export const GetReferralProgramParamsSchema = z
	.object({
		id: z.string().min(1).meta({
			description: "The ID of the referral program to fetch.",
		}),
	})
	.strict()
	.meta({ title: "GetReferralProgramParams" });

/** Every field is optional: omitted fields keep their current value */
export const UpdateReferralProgramParamsSchema = z
	.object({
		id: z.string().min(1).meta({
			description: "The ID of the referral program to update.",
		}),
		reward_id: z.string().min(1).optional().meta({
			description: "The ID of the reward granted when a code is redeemed.",
		}),
		redeem_on: ApiReferralProgramV0Schema.shape.redeem_on.optional(),
		received_by: ApiReferralProgramV0Schema.shape.received_by.optional(),
		max_redemptions: z.number().int().positive().nullish().meta({
			description:
				"A positive redemption limit, or null for unlimited redemptions.",
		}),
		plan_ids: z.array(z.string().min(1)).nullish().meta({
			description: "Required when redeem_on is checkout. Plan IDs must be unique.",
		}),
		exclude_trial: z.boolean().nullish(),
	})
	.strict()
	.superRefine((program, ctx) => {
		if (
			program.plan_ids &&
			new Set(program.plan_ids).size !== program.plan_ids.length
		) {
			ctx.addIssue({
				code: "custom",
				message: "Plan IDs must be unique",
				path: ["plan_ids"],
			});
		}

		// Checkout rules are re-validated server-side against the merged program,
		// since an omitted field here keeps whatever the program already has.
		if (program.redeem_on === RewardTriggerEvent.Checkout) {
			if (program.plan_ids !== undefined && !program.plan_ids?.length) {
				ctx.addIssue({
					code: "custom",
					message: "At least one plan is required when redeem_on is checkout",
					path: ["plan_ids"],
				});
			}
		}
	})
	.meta({ title: "UpdateReferralProgramParams" });

export const DeleteReferralProgramParamsSchema = z
	.object({
		id: z.string().min(1).meta({
			description: "The ID of the referral program to delete.",
		}),
	})
	.strict()
	.meta({ title: "DeleteReferralProgramParams" });

export const DeleteReferralProgramResponseSchema = z
	.object({
		id: z.string(),
		deleted: z.literal(true),
	})
	.meta({
		title: "DeleteReferralProgramResponse",
		examples: [{ id: "refer_a_friend", deleted: true }],
	});

export type ReferralProgramsListParams = z.infer<
	typeof ReferralProgramsListParamsSchema
>;
export type ReferralProgramsListResponse = z.infer<
	typeof ReferralProgramsListResponseSchema
>;
export type GetReferralProgramParams = z.infer<
	typeof GetReferralProgramParamsSchema
>;
export type UpdateReferralProgramParams = z.infer<
	typeof UpdateReferralProgramParamsSchema
>;
export type DeleteReferralProgramParams = z.infer<
	typeof DeleteReferralProgramParamsSchema
>;
export type DeleteReferralProgramResponse = z.infer<
	typeof DeleteReferralProgramResponseSchema
>;
