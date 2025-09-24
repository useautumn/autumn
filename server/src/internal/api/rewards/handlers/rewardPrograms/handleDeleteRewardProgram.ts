import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "delete reward scheme",
		handler: async (req, res) => {
			const { orgId, env, db } = req;
			const { id } = req.params;

			const rewardProgram = await RewardProgramService.delete({
				db,
				idOrInternalId: id,
				orgId,
				env,
			});

			return res.status(200).json(rewardProgram);
		},
	});
