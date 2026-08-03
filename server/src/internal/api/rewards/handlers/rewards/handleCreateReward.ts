import { CreateRewardParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardActions } from "@/internal/rewards/actions/index.js";
import { rewardMutationLock } from "@/internal/rewards/rewardLock.js";

export const handleCreateReward = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateRewardParamsSchema,
	lock: rewardMutationLock,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		return c.json(await rewardActions.create({ ctx, params }));
	},
});
