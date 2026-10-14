import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";
import { rewardRepo, rewardProgramRepo } from "@/internal/rewards/repos/index.js";

export const handleGetRewards = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const [rewards, rewardPrograms] = await Promise.all([
			rewardRepo.list({ db, orgId: org.id, env }),
			rewardProgramRepo.list({ db, orgId: org.id, env }),
		]);

		return c.json({ rewards, rewardPrograms });
	},
});
