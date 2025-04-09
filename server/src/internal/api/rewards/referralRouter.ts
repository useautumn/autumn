import { CusService } from "@/internal/customers/CusService.js";
import {
  generateReferralCode,
  triggerRedemption,
} from "@/internal/rewards/referralUtils.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { RewardTriggerService } from "@/internal/rewards/RewardTriggerService.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ErrCode, RewardTriggerEvent } from "@autumn/shared";
import express from "express";
import { ReferralCode, RewardRedemption } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";

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
        errorIfNotFound: true,
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

      // Get referral code by customer and reward trigger
      let existingReferralCode =
        await RewardTriggerService.getCodeByCustomerAndRewardTrigger({
          sb: req.sb,
          orgId,
          env,
          internalCustomerId: customer.internal_id,
          internalRewardTriggerId: rewardTrigger.internal_id,
        });

      if (existingReferralCode) {
        return res.status(200).json(existingReferralCode);
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

      // 1. Get redeemed by customer, and referral code
      let [customer, referralCode, org] = await Promise.all([
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
        OrgService.getFromReq(req),
      ]);

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          statusCode: 404,
          code: ErrCode.CustomerNotFound,
        });
      }

      // 2. Check that code has not reached max redemptions
      let redemptionCount = await RewardTriggerService.getCodeRedemptionCount({
        sb: req.sb,
        referralCodeId: referralCode.id,
      });

      if (redemptionCount >= referralCode.reward_trigger.max_redemptions) {
        throw new RecaseError({
          message: "Referral code has reached max redemptions",
          statusCode: 400,
          code: ErrCode.ReferralCodeMaxRedemptionsReached,
        });
      }

      // 3. Check that customer has not already redeemed a code in this referral program
      let existingRedemptions = await RewardRedemptionService.getByCustomer({
        sb: req.sb,
        internalCustomerId: customer.internal_id,
        internalRewardTriggerId: referralCode.internal_reward_trigger_id,
      });

      if (existingRedemptions.length > 0) {
        throw new RecaseError({
          message: `Customer ${customer.id} has already redeemed a code in this referral program`,
          statusCode: 400,
          code: ErrCode.CustomerAlreadyRedeemedReferralCode,
        });
      }

      // 4. Insert redemption into db
      let redemption: RewardRedemption = {
        id: generateId("rr"),
        referral_code_id: referralCode.id,
        internal_customer_id: customer.internal_id, // redeemed by customer
        internal_reward_trigger_id: referralCode.internal_reward_trigger_id,
        created_at: Date.now(),
        triggered:
          referralCode.reward_trigger.when === RewardTriggerEvent.Immediately,
        applied: false,
        updated_at: Date.now(),
      };

      redemption = await RewardRedemptionService.insert({
        sb: req.sb,
        rewardRedemption: redemption,
      });

      // 5. If reward trigger when is immediate:
      let { reward_trigger } = referralCode;

      if (referralCode.reward_trigger.when === RewardTriggerEvent.Immediately) {
        redemption = await triggerRedemption({
          sb: req.sb,
          referralCode,
          org,
          env,
          logger,
          reward: reward_trigger.reward,
          redemption,
        });
      }

      // Add coupon to customer?
      res.status(200).json(redemption);
    },
  })
);

export const redemptionRouter = express.Router();

redemptionRouter.get("/:redemptionId", (req, res) =>
  routeHandler({
    req,
    res,
    action: "get redemption by id",
    handler: async (req: any, res: any) => {
      const { orgId, env, logtail: logger } = req;
      const { redemptionId } = req.params;

      let redemption = await RewardRedemptionService.getById({
        sb: req.sb,
        id: redemptionId,
      });

      // logger.info("Returning redemption");
      // logger.info(redemption);

      res.status(200).json(redemption);
    },
  })
);
