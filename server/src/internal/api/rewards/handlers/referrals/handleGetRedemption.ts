import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get redemption by id",
		handler: async (req, res) => {
			const { db } = req;
			const { redemptionId } = req.params;

			const redemption = await RewardRedemptionService.getById({
				db,
				id: redemptionId,
			});

			res.status(200).json(redemption);
		},
	});
