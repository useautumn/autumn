import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { constructRewardProgram } from "@/internal/rewards/rewardTriggerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import {
  CreateRewardProgram,
  ErrCode,
  RewardTriggerEvent,
} from "@autumn/shared";
import express, { Router } from "express";

export const rewardProgramRouter: Router = express.Router();

rewardProgramRouter.post("", (req, res) =>
  routeHandler({
    req,
    res,
    action: "create reward trigger",
    handler: async (req: any, res: any) => {
      const { orgId, env, db } = req;
      const rewardProgram = constructRewardProgram({
        rewardProgramData: CreateRewardProgram.parse(req.body),
        orgId,
        env,
      });

      if (
        rewardProgram.when == RewardTriggerEvent.Checkout &&
        (nullish(rewardProgram.product_ids) ||
          rewardProgram.product_ids!.length == 0)
      ) {
        throw new RecaseError({
          message: "If redeem on checkout, must specify at least one product",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      let createdRewardProgram = await RewardProgramService.create({
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

      let rewardProgram = await RewardProgramService.delete({
        db,
        id,
        orgId,
        env,
      });

      return res.status(200).json(rewardProgram);
    },
  }),
);
