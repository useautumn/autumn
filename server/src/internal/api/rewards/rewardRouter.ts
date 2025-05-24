import express from "express";
import {
  CreateRewardSchema,
  ErrCode,
  RewardCategory,
  RewardType,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import {
  constructReward,
  getRewardCat,
} from "@/internal/rewards/rewardUtils.js";

const rewardRouter = express.Router();

rewardRouter.post("", async (req: any, res: any) => {
  try {
    const { db, sb, orgId, env, logtail: logger } = req;
    const rewardBody = req.body;
    const rewardData = CreateRewardSchema.parse(rewardBody);

    const org = await OrgService.getFromReq(req);

    const newReward = constructReward({
      reward: rewardData,
      orgId,
      env,
      internalId: rewardBody.internal_id,
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

      if (!discountConfig!.apply_to_all) {
        // Create stripe prices if not exists

        const batchSize = 5;

        for (let i = 0; i < prices.length; i += batchSize) {
          const batch = prices.slice(i, i + batchSize);
          const batchPriceCreate = batch.map((price) =>
            createStripePriceIFNotExist({
              stripeCli,
              price,
              entitlements,
              org,
              logger,
              db,
              product: price.product,
            }),
          );
          await Promise.all(batchPriceCreate);
        }
      }

      await createStripeCoupon({
        reward: newReward,
        stripeCli,
        org,
        prices,
      });

      console.log("✅ Reward successfully created in Stripe");
    }

    const insertedCoupon = await RewardService.insert({
      sb: req.sb,
      data: newReward,
    });
    console.log("✅ Reward successfully inserted into db");

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
    const { orgId, env } = req;
    const org = await OrgService.getFromReq(req);
    const stripeCli = createStripeCli({
      org,
      env,
    });

    try {
      await stripeCli.coupons.del(id);
    } catch (error: any) {
      console.log(`Failed to delete coupon from stripe: ${error.message}`);
    }

    await RewardService.deleteStrict({
      sb: req.sb,
      internalId: id,
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
    const { orgId, env, db } = req;
    const rewardBody = req.body;

    const org = await OrgService.getFromReq(req);
    const stripeCli = createStripeCli({
      org,
      env,
    });

    const reward = await RewardService.getByInternalId({
      sb: req.sb,
      internalId,
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
    await stripeCli.coupons.del(reward.id);

    let rewardCat = getRewardCat(rewardBody);
    if (rewardCat == RewardCategory.Discount) {
      await createStripeCoupon({
        reward: rewardBody,
        stripeCli,
        org,
        prices,
      });
    }

    // 3. Update coupon in db
    const updatedCoupon = await RewardService.update({
      sb: req.sb,
      internalId,
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

export default rewardRouter;
