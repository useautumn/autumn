import {
	CreateRewardProgram,
	ErrCode,
	RewardTriggerEvent,
} from "@autumn/shared";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { constructRewardProgram } from "@/internal/rewards/rewardTriggerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "create trigger",
		handler: async (req, res) => {
			const { orgId, env, db } = req;
			const body = req.body;

			if (!body.internal_reward_id) {
				throw new RecaseError({
					message: "Please select a reward to link this program to",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			if (!body.id) {
				throw new RecaseError({
					message: "Please give this program an ID",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const existingProgram = await RewardProgramService.get({
				db,
				idOrInternalId: body.id,
				orgId,
				env,
			});

			if (existingProgram) {
				throw new RecaseError({
					message: `Program with ID ${body.id} already exists`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const rewardProgram = constructRewardProgram({
				rewardProgramData: CreateRewardProgram.parse(req.body),
				orgId,
				env,
			});

			// Fetch reward ID
			// let reward = await RewardService.get({
			//   db,
			//   id: rewardProgram.internal_reward_id,
			//   orgId,
			//   env,
			// });

			if (
				rewardProgram.when === RewardTriggerEvent.Checkout &&
				(nullish(rewardProgram.product_ids) ||
					rewardProgram.product_ids!.length === 0)
			) {
				throw new RecaseError({
					message: "If redeem on checkout, must specify at least one product",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const createdRewardProgram = await RewardProgramService.create({
				db,
				data: rewardProgram,
			});

			return res.status(200).json(createdRewardProgram);
		},
	});
