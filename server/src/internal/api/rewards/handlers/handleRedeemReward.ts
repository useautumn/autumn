import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardActions } from "@/internal/rewards/actions/index.js";

export const handleRedeemReward = createRoute({
	body: z.object({
		code: z.string().min(1),
		customer_id: z.string().min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { code, customer_id } = c.req.valid("json");

		const result = await rewardActions.redeemPromoCode({
			ctx,
			code,
			customerId: customer_id,
		});

		return c.json(result);
	},
});
