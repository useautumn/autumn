import {
	DeleteRewardParamsSchema,
	GetRewardParamsSchema,
	Scopes,
	UpdateRewardParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	deleteApiReward,
	getApiRewardById,
} from "@/internal/rewards/actions/apiRewards.js";
import { updateApiReward } from "@/internal/rewards/actions/updateApiReward.js";
import { rewardMutationLock } from "@/internal/rewards/rewardLock.js";

export const handleGetReward = createRoute({
	scopes: [Scopes.Rewards.Read],
	body: GetRewardParamsSchema,
	handler: async (c) =>
		c.json(
			await getApiRewardById({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			}),
		),
});

export const handleUpdateReward = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: UpdateRewardParamsSchema,
	lock: rewardMutationLock,
	handler: async (c) =>
		c.json(
			await updateApiReward({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			}),
		),
});

export const handleDeleteReward = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: DeleteRewardParamsSchema,
	lock: rewardMutationLock,
	handler: async (c) =>
		c.json(
			await deleteApiReward({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			}),
		),
});
