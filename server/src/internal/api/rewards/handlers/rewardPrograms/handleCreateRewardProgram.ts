import {
	CreateRewardProgram,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";
import { constructRewardProgram } from "@/internal/rewards/rewardUtils.js";
import {
	validateRewardIsFeatureGrant,
	validateRewardProgramTrigger,
} from "./validateRewardProgram.js";

export const handleCreateRewardProgram = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateRewardProgram,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const body = c.req.valid("json");

		const existingProgram = await rewardProgramRepo.get({
			db,
			idOrInternalId: body.id,
			orgId: org.id,
			env,
		});

		if (existingProgram) {
			throw new RecaseError({
				message: `Program with ID ${body.id} already exists`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

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

		const rewardProgram = constructRewardProgram({
			rewardProgramData: CreateRewardProgram.parse({
				...body,
				internal_reward_id: reward.internal_id,
			}),
			orgId: org.id,
			env,
		});

		validateRewardProgramTrigger({
			when: rewardProgram.when,
			productIds: rewardProgram.product_ids,
			maxRedemptions: rewardProgram.max_redemptions,
		});

		const createdRewardProgram = await rewardProgramRepo.insert({
			db,
			data: rewardProgram,
		});

		return c.json(createdRewardProgram);
	},
});
