import { RewardTriggerEvent } from "@models/rewardModels/rewardProgramModels/rewardProgramEnums.js";
import { z } from "zod/v4";
import {
	ApiReferralProgramV0Schema,
	REFERRAL_PROGRAM_V0_EXAMPLE,
} from "./components/apiReferralProgramV0.js";

export const CreateReferralProgramParamsSchema =
	ApiReferralProgramV0Schema.omit({
		created_at: true,
	})
		.extend({
			id: z.string().min(1),
			reward_id: z.string().min(1),
			max_redemptions: z.number().int().positive().nullish().meta({
				description:
					"A positive redemption limit, or null for unlimited redemptions.",
			}),
			plan_ids: z.array(z.string().min(1)).nullish().meta({
				description:
					"Required when redeem_on is checkout. Plan IDs must be unique.",
			}),
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

			if (program.redeem_on !== RewardTriggerEvent.Checkout) return;

			if (!program.plan_ids?.length) {
				ctx.addIssue({
					code: "custom",
					message: "At least one plan is required when redeem_on is checkout",
					path: ["plan_ids"],
				});
			}

			// Checkout grants are skipped when redemption count >= max, so 0 blocks every grant
			if (!program.max_redemptions) {
				ctx.addIssue({
					code: "custom",
					message:
						"max_redemptions must be greater than 0 when redeem_on is checkout",
					path: ["max_redemptions"],
				});
			}
		})
		.meta({
			title: "CreateReferralProgramRequest",
			examples: [REFERRAL_PROGRAM_V0_EXAMPLE],
		});

export const CreateReferralProgramResponseSchema =
	ApiReferralProgramV0Schema.meta({
		title: "CreateReferralProgramResponse",
		examples: [REFERRAL_PROGRAM_V0_EXAMPLE],
	});

export type CreateReferralProgramParams = z.infer<
	typeof CreateReferralProgramParamsSchema
>;
export type CreateReferralProgramResponse = z.infer<
	typeof CreateReferralProgramResponseSchema
>;
