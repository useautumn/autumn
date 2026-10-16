import { CreateRewardSchema, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval.js";
import { createReward } from "@/internal/rewards/actions/createReward.js";
import { rewardMutationLock } from "@/internal/rewards/rewardLock.js";

const CreateCouponQuerySchema = z.object({
	legacyStripe: z.boolean().optional(),
});

export const handleCreateCoupon = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateRewardSchema,
	query: CreateCouponQuerySchema,
	lock: rewardMutationLock,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const rewardData = c.req.valid("json");
		const { legacyStripe } = c.req.valid("query");
		await checkRouteApproval({
			ctx,
			action: "rewards.create",
			buildFacts: async () => null,
		});
		return c.json(await createReward({ ctx, rewardData, legacyStripe }));
	},
});
