import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";

const DeleteRewardProgramParamsSchema = z.object({
	id: z.string(),
});

export const handleDeleteRewardProgram = createRoute({
	params: DeleteRewardProgramParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const { id } = c.req.param();

		const rewardProgram = await RewardProgramService.delete({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});

		return c.json(rewardProgram);
	},
});
