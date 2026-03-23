import { z } from "zod/v4";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";
import { createRoute } from "../../../../../honoMiddlewares/routeHandler";
export const handleGetRedemption = createRoute({
	params: z.object({ redemption_id: z.string() }),
	handler: async (c) => {
		const { db } = c.get("ctx");
		const { redemption_id } = c.req.param();

		const redemption = await redemptionRepo.getById({
			db,
			id: redemption_id,
		});

		return c.json(redemption);
	},
});
