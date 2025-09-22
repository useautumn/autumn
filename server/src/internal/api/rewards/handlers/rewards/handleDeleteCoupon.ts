import { ErrCode } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "delete reward",
		handler: async (req, res) => {
			const { id } = req.params;
			const { orgId, env, db } = req;

			const org = await OrgService.getFromReq(req);
			const stripeCli = createStripeCli({
				org,
				env,
			});

			const reward = await RewardService.get({
				db,
				idOrInternalId: id,
				orgId,
				env,
			});

			if (!reward) {
				throw new RecaseError({
					message: `Reward ${id} not found`,
					code: ErrCode.InvalidRequest,
				});
			}

			try {
				await stripeCli.coupons.del(reward.id);
			} catch (error) {
				console.log(`Failed to delete coupon from stripe: ${(error as { message: string }).message}`);
			}

			await RewardService.delete({
				db,
				internalId: reward.internal_id,
				env,
				orgId,
			});

			res.status(200).json({
				success: true,
				message: "Reward deleted successfully",
			});
		},
	});
