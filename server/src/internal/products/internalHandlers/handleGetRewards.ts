import { createRoute } from "@/honoMiddlewares/routeHandler";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService";
import { RewardService } from "@/internal/rewards/RewardService";

/**
 * GET /products/rewards
 * Used by: vite/src/hooks/queries/useRewardsQuery.tsx
 */
export const handleGetRewards = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const rewards = await RewardService.list({ db, orgId: org.id, env });
		const rewardPrograms = await RewardProgramService.list({
			db,
			orgId: org.id,
			env,
		});

		return c.json({ rewards, rewardPrograms });
	},
});
