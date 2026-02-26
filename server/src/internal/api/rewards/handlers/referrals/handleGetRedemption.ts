import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { createRoute } from "../../../../../honoMiddlewares/routeHandler";
export const handleGetRedemption = createRoute({
	params: z.object({ redemption_id: z.string() }),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { redemption_id } = c.req.param();

		const redemption = await RewardRedemptionService.getById({
			db,
			id: redemption_id,
			orgId: org.id,
			env,
		});

		return c.json(redemption);
	},
});
