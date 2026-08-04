import {
	ErrCode,
	RecaseError,
	type RewardProgram,
	Scopes,
	UpdateRewardProgram,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";
import {
	validateRewardIsFeatureGrant,
	validateTriggerConfig,
} from "./validateRewardProgram.js";

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

			validateRewardIsFeatureGrant(reward);

			// The lookup accepts id or internal_id, but the FK requires internal_id
			internalRewardId = reward.internal_id;
		}

		validateTriggerConfig({
			when: body.when,
			productIds: body.product_ids,
			maxRedemptions: body.max_redemptions,
		});

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
