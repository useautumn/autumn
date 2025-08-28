import express from "express";
import { CreateRewardSchema, ErrCode, RewardCategory } from "@autumn/shared";
import { Router } from "express";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import {
  constructReward,
  getRewardCat,
  initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";

const rewardRouter: Router = express.Router();

rewardRouter.post("", async (req: any, res: any) => {
  try {
    const { db, orgId, env, logtail: logger } = req;
    const rewardBody = req.body;
    const rewardData = CreateRewardSchema.parse(rewardBody);

    const org = await OrgService.getFromReq(req);

    const newReward = constructReward({
      reward: rewardData,
      orgId,
      env,
      // internalId: rewardBody.internal_id,
    });

    if (getRewardCat(newReward) === RewardCategory.Discount) {
      const stripeCli = createStripeCli({
        org,
        env,
      });

      let discountConfig = newReward.discount_config;

      // Get prices for coupon
      const [prices, entitlements] = await Promise.all([
        PriceService.getInIds({
          db,
          ids: discountConfig!.price_ids || [],
        }),
        EntitlementService.getByOrg({
          db,
          orgId,
          env,
        }),
      ]);

      await initRewardStripePrices({
        db,
        prices,
        org,
        env,
        logger,
      });

      await createStripeCoupon({
        reward: newReward,
        org,
        env,
        prices,
        logger,
        legacyVersion: req.query.legacyStripe === "true",
      });
    }

    const insertedCoupon = await RewardService.insert({
      db,
      data: newReward,
    });

    res.status(200).json(insertedCoupon);
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "create coupon",
    });
  }
});

rewardRouter.delete("/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { orgId, env, db } = req;

    const org = await OrgService.getFromReq(req);
    const stripeCli = createStripeCli({
      org,
      env,
    });

    let reward = await RewardService.get({
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
    } catch (error: any) {
      console.log(`Failed to delete coupon from stripe: ${error.message}`);
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
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "delete coupon",
    });
  }
});

rewardRouter.post("/:internalId", async (req: any, res: any) => {
  try {
    const { internalId } = req.params;
    const { orgId, env, db, logtail: logger } = req;
    const rewardBody = req.body;

    const org = await OrgService.getFromReq(req);
    const stripeCli = createStripeCli({
      org,
      env,
    });

    const reward = await RewardService.get({
      db,
      idOrInternalId: internalId,
      orgId,
      env,
    });

    if (!reward) {
      throw new RecaseError({
        message: `Reward ${internalId} not found`,
        code: ErrCode.InvalidRequest,
      });
    }

    const prices = await PriceService.getInIds({
      db,
      ids: rewardBody.price_ids,
    });

    // 1. Delete old prices from stripe
    try {
      await stripeCli.coupons.del(reward.id);
      await stripeCli.coupons.del(reward.internal_id);
    } catch (error) {
      // console.log(`Failed to delete coupon from stripe: ${error.message}`);
    }

    let rewardCat = getRewardCat(rewardBody);
    if (rewardCat == RewardCategory.Discount) {
      await createStripeCoupon({
        reward: rewardBody,
        org,
        env,
        prices,
        logger,
        legacyVersion: req.query.legacyStripe === "true",
      });
    }

    // 3. Update coupon in db
    const updatedCoupon = await RewardService.update({
      db,
      internalId: reward.internal_id,
      env,
      orgId,
      update: rewardBody,
    });

    res.status(200).json(updatedCoupon);
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "update coupon",
    });
  }
});

rewardRouter.get("/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { orgId, env, db } = req;

    const reward = await RewardService.get({
      db,
      idOrInternalId: id,
      orgId,
      env,
    });

    res.status(200).json(reward);
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "get reward",
    });
  }
});

export default rewardRouter;
