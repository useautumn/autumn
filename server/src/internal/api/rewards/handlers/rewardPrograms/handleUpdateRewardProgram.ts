import {
	ErrCode,
	nullish,
	RecaseError,
	type RewardProgram,
	RewardTriggerEvent,
	UpdateRewardProgram,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";

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

		if (
			body.when === RewardTriggerEvent.Checkout &&
			(nullish(body.product_ids) || body.product_ids.length === 0)
		) {
			throw new RecaseError({
				message:
					"When `Redeem On` is set to `Checkout`, must specify at least one product",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const updatedRewardProgram = await rewardProgramRepo.update({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
			data: body as RewardProgram,
		});

		return c.json(updatedRewardProgram);
	},
});
