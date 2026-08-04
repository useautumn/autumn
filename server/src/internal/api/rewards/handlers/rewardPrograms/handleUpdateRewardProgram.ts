import {
	ErrCode,
	nullish,
	RecaseError,
	type RewardProgram,
	RewardTriggerEvent,
	RewardType,
	Scopes,
	UpdateRewardProgram,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";

const UpdateRewardProgramParamsSchema = z.object({
	id: z.string(),
});

export const handleUpdateRewardProgram = createRoute({
	scopes: [Scopes.Rewards.Write],
	params: UpdateRewardProgramParamsSchema,
	body: UpdateRewardProgram,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const { id } = c.req.param();
		const body = c.req.valid("json");

		if (!body.internal_reward_id) {
			throw new RecaseError({
				message: "Please select a reward to link this program to",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const existingProgram = await rewardProgramRepo.get({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});

		if (!existingProgram) {
			throw new RecaseError({
				message: `Reward program ${id} not found`,
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		const isChangingReward =
			body.internal_reward_id !== existingProgram.internal_reward_id;

		let internalRewardId = body.internal_reward_id;

		if (isChangingReward) {
			const reward = await rewardRepo.get({
				db,
				idOrInternalId: body.internal_reward_id,
				orgId: org.id,
				env,
			});

			if (!reward) {
				throw new RecaseError({
					message: `Reward ${body.internal_reward_id} not found`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			if (reward.type !== RewardType.FeatureGrant) {
				throw new RecaseError({
					message:
						"Referral programs must be linked to a feature grant reward. Existing programs using other reward types continue to work, but cannot be relinked to another non-feature-grant reward.",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			// The lookup accepts id or internal_id, but the FK requires internal_id
			internalRewardId = reward.internal_id;
		}

		if (body.when === RewardTriggerEvent.Checkout) {
			if (nullish(body.product_ids) || body.product_ids.length === 0) {
				throw new RecaseError({
					message:
						"When `Redeem On` is set to `Checkout`, must specify at least one product",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			// Checkout grants are skipped when redemption count >= max, so 0 blocks every grant
			if (!body.max_redemptions) {
				throw new RecaseError({
					message:
						"When `Redeem On` is set to `Checkout`, max redemptions must be greater than 0",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		}

		const updatedRewardProgram = await rewardProgramRepo.update({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
			data: {
				...body,
				internal_reward_id: internalRewardId,
			} as RewardProgram,
		});

		return c.json(updatedRewardProgram);
	},
});
