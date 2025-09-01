import {
	CreateRewardProgram,
	ErrCode,
	RewardTriggerEvent,
} from "@autumn/shared";
import express, { type Router } from "express";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { constructRewardProgram } from "@/internal/rewards/rewardTriggerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const rewardProgramRouter: Router = express.Router();

rewardProgramRouter.post("", (req, res) =>
	routeHandler({
		req,
		res,
		action: "create reward trigger",
		handler: async (req: any, res: any) => {
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
				id: body.id,
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
					rewardProgram.product_ids?.length === 0)
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
	}),
);

rewardProgramRouter.delete("/:id", (req, res) =>
	routeHandler({
		req,
		res,
		action: "delete reward scheme",
		handler: async (req: any, res: any) => {
			const { orgId, env, db } = req;
			const { id } = req.params;

			const rewardProgram = await RewardProgramService.delete({
				db,
				id,
				orgId,
				env,
			});

			return res.status(200).json(rewardProgram);
		},
	}),
);
