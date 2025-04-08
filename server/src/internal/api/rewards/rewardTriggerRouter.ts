import { CusService } from "@/internal/customers/CusService.js";
import { generateReferralCode } from "@/internal/rewards/referralUtils.js";
import { RewardTriggerService } from "@/internal/rewards/RewardTriggerService.js";
import { constructRewardTrigger } from "@/internal/rewards/rewardTriggerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CreateRewardTrigger, ErrCode } from "@autumn/shared";
import { ReferralCode } from "@shared/models/rewardModels/referralModels/referralModels.js";
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

      console.log("rewardTrigger", rewardTrigger);

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

export const referralRouter = express.Router();

// 1. Get referral code
referralRouter.post("/code", (req, res) =>
  routeHandler({
    req,
    res,
    action: "get referral code",
    handler: async (req: any, res: any) => {
      const { orgId, env, logtail: logger } = req;
      const { referral_id: rewardTriggerId, customer_id: customerId } =
        req.body;

      let rewardTrigger = await RewardTriggerService.getById({
        sb: req.sb,
        id: rewardTriggerId,
        orgId,
        env,
      });

      let customer = await CusService.getById({
        sb: req.sb,
        orgId,
        env,
        id: customerId,
        logger,
      });

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          statusCode: 404,
          code: ErrCode.CustomerNotFound,
        });
      }

      // Get random 8 letter code
      const code = generateReferralCode();

      let referralCode: ReferralCode = {
        code,
        org_id: orgId,
        env,
        internal_customer_id: customer.internal_id,
        internal_reward_trigger_id: rewardTrigger.internal_id,
        id: generateId("rc"),
        created_at: Date.now(),
      };

      await RewardTriggerService.createReferralCode({
        sb: req.sb,
        data: referralCode,
      });

      res.status(200).json(referralCode);
    },
  })
);

referralRouter.post("/redeem", (req, res) =>
  routeHandler({
    req,
    res,
    action: "redeem referral code",
    handler: async (req: any, res: any) => {
      const { orgId, env, logtail: logger } = req;
      // const { referral_id: rewardTriggerId } = req.params;
      const { code, customer_id: customerId } = req.body;

      // Redeemed by customer_id

      let [customer, referralCode] = await Promise.all([
        CusService.getById({
          sb: req.sb,
          orgId,
          env,
          id: customerId,
          logger,
        }),
        RewardTriggerService.getReferralCode({
          sb: req.sb,
          orgId,
          env,
          code,
          withRewardTrigger: true,
        }),
      ]);

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          statusCode: 404,
          code: ErrCode.CustomerNotFound,
        });
      }

      console.log("Referral code:", referralCode);

      // let maxRedemptions = referralCode.reward_trigger.max_redemptions;

      let redemptionCount = await RewardTriggerService.getCodeRedemptionCount({
        sb: req.sb,
        orgId,
        env,
        code,
      });

      if (redemptionCount >= referralCode.reward_trigger.max_redemptions) {
        throw new RecaseError({
          message: "Referral code has reached max redemptions",
          statusCode: 400,
          code: ErrCode.ReferralCodeMaxRedemptionsReached,
        });
      }

      // console.log("Redemption count:", redemptionCount);

      // Add coupon to customer?

      res.status(200).json({
        referralCode,
      });

      // 1. Check how many times code has been redeemed
    },
  })
);
