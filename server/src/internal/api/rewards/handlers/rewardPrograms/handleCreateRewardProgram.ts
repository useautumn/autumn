import {
	CreateRewardProgram,
	ErrCode,
	RecaseError,
	RewardTriggerEvent,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { constructRewardProgram } from "@/internal/rewards/rewardTriggerUtils.js";
import { nullish } from "@/utils/genUtils.js";

export const handleCreateRewardProgram = createRoute({
	body: CreateRewardProgram,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const body = c.req.valid("json");

		if (!body.internal_reward_id) {
			throw new RecaseError({
				message: "Please select a reward to link this program to",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (!body.id) {
			throw new RecaseError({
				message: "Please give this program an ID",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const existingProgram = await RewardProgramService.get({
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

		const reward = await RewardService.get({
			db,
			idOrInternalId: body.internal_reward_id,
			orgId: org.id,
			env,
		});

		if (!reward) {
			throw new RecaseError({
				message: "Reward not found",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const rewardProgram = constructRewardProgram({
			rewardProgramData: CreateRewardProgram.parse({
				...body,
				internal_reward_id: reward.internal_id,
			}),
			orgId: org.id,
			env,
		});

		if (
			rewardProgram.when === RewardTriggerEvent.Checkout &&
			(nullish(rewardProgram.product_ids) ||
				rewardProgram.product_ids!.length === 0)
		) {
			throw new RecaseError({
				message: "If redeem on checkout, must specify at least one product",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const createdRewardProgram = await RewardProgramService.create({
			db,
			data: rewardProgram,
		});

		return c.json(createdRewardProgram);
	},
});
