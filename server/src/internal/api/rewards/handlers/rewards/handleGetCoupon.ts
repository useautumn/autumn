import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RewardService } from "@/internal/rewards/RewardService.js";

const GetCouponParamsSchema = z.object({
	id: z.string(),
});

export const handleGetCoupon = createRoute({
	params: GetCouponParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const { id } = c.req.param();

		const reward = await RewardService.get({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});

		return c.json(reward);
	},
});
