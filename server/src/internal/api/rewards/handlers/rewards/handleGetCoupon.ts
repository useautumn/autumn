import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";

const GetCouponParamsSchema = z.object({
	id: z.string(),
});

export const handleGetCoupon = createRoute({
	params: GetCouponParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const { id } = c.req.param();

		const reward = await rewardRepo.get({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});

		return c.json(reward);
	},
});
