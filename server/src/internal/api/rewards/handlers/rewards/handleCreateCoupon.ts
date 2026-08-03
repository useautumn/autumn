import { CreateRewardSchema, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createReward } from "@/internal/rewards/actions/createReward.js";

const CreateCouponQuerySchema = z.object({
	legacyStripe: z.boolean().optional(),
});

export const handleCreateCoupon = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateRewardSchema,
	query: CreateCouponQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const rewardData = c.req.valid("json");
		const { legacyStripe } = c.req.valid("query");
		return c.json(await createReward({ ctx, rewardData, legacyStripe }));
	},
});
