import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
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

      let existingProgram = await RewardProgramService.get({
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
  })
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
        idOrInternalId: id,
        orgId,
        env,
      });

      return res.status(200).json(rewardProgram);
    },
  })
);

rewardProgramRouter.put("/:id", (req, res) =>
  routeHandler({
    req,
    res,
    action: "update reward program",
    handler: async (req: any, res: any) => {
      const { orgId, env, db } = req;
      const { id } = req.params;
      const body = req.body;

      if (!body.internal_reward_id) {
        throw new RecaseError({
          message: "Please select a reward to link this program to",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      // Ensure program exists
      let existingProgram = await RewardProgramService.get({
        db,
        idOrInternalId: id,
        orgId,
        env,
      });

      // console.log("Existing program:", existingProgram);

      if (!existingProgram) {
        throw new RecaseError({
          message: `Program with ID ${id} does not exist`,
          code: ErrCode.InvalidRequest,
          statusCode: 404,
        });
      }

      const rewardProgram = constructRewardProgram({
        rewardProgramData: CreateRewardProgram.parse({
          ...body,
          id: existingProgram.id, // ID cannot be changed
        }),
        orgId,
        env,
      });

      // console.log("Updating program to:", rewardProgram);

      if (
        rewardProgram.when == RewardTriggerEvent.Checkout &&
        (nullish(rewardProgram.product_ids) ||
          rewardProgram.product_ids!.length == 0)
      ) {
        throw new RecaseError({
          message:
            "When `Redeem On` is set to `Checkout`, must specify at least one product",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      let updatedRewardProgram = await RewardProgramService.update({
        db,
        idOrInternalId: id,
        orgId,
        env,
        data: rewardProgram,
      });

      return res.status(200).json(updatedRewardProgram);
    },
  })
);
