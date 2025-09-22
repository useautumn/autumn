import { RewardService } from "@/internal/rewards/RewardService.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) => routeHandler({
    req,
    res,
    action: "get reward",
    handler: async (req, res) => {
        const { id } = req.params;
		const { orgId, env, db } = req;

		const reward = await RewardService.get({
			db,
			idOrInternalId: id,
			orgId,
			env,
		});

		res.status(200).json(reward);
    }
});