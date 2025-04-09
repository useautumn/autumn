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
import express from "express";

export const rewardProgramRouter = express.Router();

rewardProgramRouter.post("", (req, res) =>
  routeHandler({
    req,
    res,
    action: "create reward trigger",
    handler: async (req: any, res: any) => {
      const { orgId, env } = req;
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
        sb: req.sb,
        data: rewardProgram,
      });

      console.log("✅ Successfully created reward scheme");

      return res.status(200).json(createdRewardProgram);
    },
  })
);

rewardProgramRouter.delete("/:id", (req, res) =>
  routeHandler({
    req,
    res,
    action: "delete reward scheme",
    handler: async (req: any, res: any) => {
      const { orgId, env } = req;
      const { id } = req.params;

      let rewardProgram = await RewardProgramService.deleteById({
        sb: req.sb,
        id,
        orgId,
        env,
      });

      return res.status(200).json(rewardProgram);
    },
  })
);
