import express, { type Router } from "express";
import {
  handleCreateRewardProgram,
  handleDeleteRewardProgram,
} from "./handlers/rewardPrograms/index.js";
import { routeHandler } from "@/utils/routerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  CreateRewardProgram,
  ErrCode,
  nullish,
  RewardTriggerEvent,
} from "@autumn/shared";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { constructRewardProgram } from "@/internal/rewards/rewardTriggerUtils.js";

export const rewardProgramRouter: Router = express.Router();

rewardProgramRouter.post("", handleCreateRewardProgram);

rewardProgramRouter.delete("/:id", handleDeleteRewardProgram);

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

      // Update on existing redemptions? (should be none unless affecting stacked rewards...)

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
