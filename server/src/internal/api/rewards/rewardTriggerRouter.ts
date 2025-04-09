import { RewardTriggerService } from "@/internal/rewards/RewardTriggerService.js";
import { constructRewardTrigger } from "@/internal/rewards/rewardTriggerUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CreateRewardTrigger } from "@autumn/shared";
import express from "express";

export const rewardTriggerRouter = express.Router();

rewardTriggerRouter.post("", (req, res) =>
  routeHandler({
    req,
    res,
    action: "create reward trigger",
    handler: async (req: any, res: any) => {
      const { orgId, env } = req;
      const rewardTrigger = constructRewardTrigger({
        rewardTriggerData: CreateRewardTrigger.parse(req.body),
        orgId,
        env,
      });

      let createdRewardTrigger = await RewardTriggerService.createRewardTrigger(
        {
          sb: req.sb,
          data: rewardTrigger,
        }
      );

      return res.status(200).json(createdRewardTrigger);
    },
  })
);

rewardTriggerRouter.delete("/:id", (req, res) =>
  routeHandler({
    req,
    res,
    action: "delete reward trigger",
    handler: async (req: any, res: any) => {
      const { orgId, env } = req;
      const { id } = req.params;

      let rewardTrigger = await RewardTriggerService.deleteById({
        sb: req.sb,
        id,
        orgId,
        env,
      });

      return res.status(200).json(rewardTrigger);
    },
  })
);
