import { z } from "zod/v4";
import {
	getListResponseSchema,
	SuccessResponseSchema,
} from "../common/commonResponses.js";
import {
	ApiReferralProgramV0Schema,
	REFERRAL_PROGRAM_V0_EXAMPLE,
} from "./components/apiReferralProgramV0.js";

const referralProgramId = z.string().min(1).meta({
	description: "The ID of the referral program.",
});

const uniquePlanIds = z.array(z.string().min(1)).nullish().meta({
	description: "Required when redeem_on is checkout. Plan IDs must be unique.",
});

export const ReferralProgramsListParamsSchema = z.object({}).optional();

export const ReferralProgramsListResponseSchema = getListResponseSchema({
	schema: ApiReferralProgramV0Schema,
}).meta({
	title: "ListReferralProgramsResponse",
	examples: [{ list: [REFERRAL_PROGRAM_V0_EXAMPLE] }],
});

export const GetReferralProgramParamsSchema = z
	.object({ referral_program_id: referralProgramId })
	.strict()
	.meta({ title: "GetReferralProgramParams" });

export const GetReferralProgramResponseSchema = ApiReferralProgramV0Schema.meta(
	{
		title: "GetReferralProgramResponse",
		examples: [REFERRAL_PROGRAM_V0_EXAMPLE],
	},
);

/** Omitted fields keep their current value; checkout rules are re-checked on the merged program */
export const UpdateReferralProgramParamsSchema = z
	.object({
		referral_program_id: referralProgramId,
		reward_id: z.string().min(1).optional().meta({
			description: "The ID of the reward granted when a code is redeemed.",
		}),
		redeem_on: ApiReferralProgramV0Schema.shape.redeem_on.optional(),
		received_by: ApiReferralProgramV0Schema.shape.received_by.optional(),
		max_redemptions: z.number().int().positive().optional().meta({
			description: "A positive redemption limit.",
		}),
		plan_ids: z.array(z.string().min(1)).optional().meta({
			description:
				"Required when redeem_on is checkout. Plan IDs must be unique.",
		}),
		exclude_trial: z.boolean().optional(),
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
	})
	.meta({ title: "UpdateReferralProgramParams" });

export const UpdateReferralProgramResponseSchema =
	ApiReferralProgramV0Schema.meta({
		title: "UpdateReferralProgramResponse",
		examples: [REFERRAL_PROGRAM_V0_EXAMPLE],
	});

export const DeleteReferralProgramParamsSchema = z
	.object({ referral_program_id: referralProgramId })
	.strict()
	.meta({ title: "DeleteReferralProgramParams" });

export const DeleteReferralProgramResponseSchema = SuccessResponseSchema.meta({
	title: "DeleteReferralProgramResponse",
	examples: [{ success: true }],
});

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
