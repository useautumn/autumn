import { CusService } from "@/internal/customers/CusService.js";
import {
  generateReferralCode,
  triggerRedemption,
} from "@/internal/rewards/referralUtils.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";

import RecaseError from "@/utils/errorUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ErrCode, RewardTriggerEvent } from "@autumn/shared";
import express, { Router } from "express";
import { RewardRedemption } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";

export const referralRouter: Router = express.Router();

// 1. Get referral code
referralRouter.post("/code", (req, res) =>
  routeHandler({
    req,
    res,
    action: "get referral code",
    handler: async (req: any, res: any) => {
      const { orgId, env, logtail: logger, db } = req;
      const { program_id: rewardProgramId, customer_id: customerId } = req.body;

      let [rewardProgram, customer] = await Promise.all([
        RewardProgramService.get({
          db,
          id: rewardProgramId,
          orgId,
          env,
          errorIfNotFound: true,
        }),
        CusService.get({
          db: req.db,
          orgId,
          env,
          idOrInternalId: customerId,
        }),
      ]);

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          statusCode: 404,
          code: ErrCode.CustomerNotFound,
        });
      }

      if (!rewardProgram) {
        throw new RecaseError({
          message: "Reward program not found",
          statusCode: 404,
          code: ErrCode.RewardProgramNotFound,
        });
      }

      // Get referral code by customer and reward trigger
      let referralCode =
        await RewardProgramService.getCodeByCustomerAndRewardProgram({
          db,
          orgId,
          env,
          internalCustomerId: customer.internal_id,
          internalRewardProgramId: rewardProgram.internal_id,
        });

      if (!referralCode) {
        const code = generateReferralCode();

        referralCode = {
          code,
          org_id: orgId,
          env,
          internal_customer_id: customer.internal_id,
          internal_reward_program_id: rewardProgram.internal_id,
          id: generateId("rc"),
          created_at: Date.now(),
        };

        referralCode = await RewardProgramService.createReferralCode({
          db,
          data: referralCode,
        });
      }

      res.status(200).json({
        code: referralCode.code,
        customer_id: customer.id,
        created_at: referralCode.created_at,
      });
    },
  }),
);

referralRouter.post("/redeem", (req, res) =>
  routeHandler({
    req,
    res,
    action: "redeem referral code",
    handler: async (req: any, res: any) => {
      const { orgId, env, logtail: logger, db } = req;
      // const { referral_id: rewardTriggerId } = req.params;
      const { code, customer_id: customerId } = req.body;

      // 1. Get redeemed by customer, and referral code
      let [customer, referralCode, org] = await Promise.all([
        CusService.get({
          db,
          orgId,
          env,
          idOrInternalId: customerId,
        }),
        RewardProgramService.getReferralCode({
          db,
          orgId,
          env,
          code,
          withRewardProgram: true,
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
      let redemptionCount = await RewardProgramService.getCodeRedemptionCount({
        db,
        referralCodeId: referralCode.id,
      });

      if (
        referralCode.reward_program.max_redemptions &&
        redemptionCount >= referralCode.reward_program.max_redemptions
      ) {
        throw new RecaseError({
          message: "Referral code has reached max redemptions",
          statusCode: 400,
          code: ErrCode.ReferralCodeMaxRedemptionsReached,
        });
      }

      // 3. Check that customer has not already redeemed a code in this referral program
      let existingRedemptions = await RewardRedemptionService.getByCustomer({
        db,
        internalCustomerId: customer.internal_id,
        internalRewardProgramId: referralCode.internal_reward_program_id,
      });

      if (existingRedemptions.length > 0) {
        throw new RecaseError({
          message: `Customer ${customer.id} has already redeemed a code in this referral program`,
          statusCode: 400,
          code: ErrCode.CustomerAlreadyRedeemedReferralCode,
        });
      }

      // Don't let customer redeem their own code
      let codeCustomer = await CusService.getByInternalId({
        db: req.db,
        internalId: referralCode.internal_customer_id,
      });

      if (!codeCustomer) {
        throw new RecaseError({
          message: "Referral code customer not found",
          statusCode: 404,
          code: ErrCode.CustomerNotFound,
        });
      }

      if (
        codeCustomer.id === customer.id ||
        (notNullish(codeCustomer.fingerprint) &&
          codeCustomer.fingerprint === customer.fingerprint)
      ) {
        throw new RecaseError({
          message: "Customer cannot redeem their own code",
          statusCode: 400,
          code: ErrCode.CustomerCannotRedeemOwnCode,
        });
      }

      // 4. Insert redemption into db
      let redemption: RewardRedemption = {
        id: generateId("rr"),
        referral_code_id: referralCode.id,
        internal_customer_id: customer.internal_id, // redeemed by customer
        internal_reward_program_id: referralCode.internal_reward_program_id,
        created_at: Date.now(),
        triggered:
          referralCode.reward_program.when ===
          RewardTriggerEvent.CustomerCreation,
        applied: false,
        updated_at: Date.now(),
      };

      redemption = await RewardRedemptionService.insert({
        db,
        rewardRedemption: redemption,
      });

      // 5. If reward trigger when is immediate:
      let { reward_program } = referralCode;

      if (
        referralCode.reward_program.when === RewardTriggerEvent.CustomerCreation
      ) {
        redemption = await triggerRedemption({
          db: req.db,
          referralCode,
          org,
          env,
          logger,
          reward: reward_program.reward,
          redemption,
        });
      }

      // Add coupon to customer?
      res.status(200).json({
        id: redemption.id,
        customer_id: customer.id,
        // triggered: redemption?.applied,
        // applied: redemption?.applied,
        reward_id: reward_program.reward.id,
      });
    },
  }),
);

export const redemptionRouter: Router = express.Router();

redemptionRouter.get("/:redemptionId", (req, res) =>
  routeHandler({
    req,
    res,
    action: "get redemption by id",
    handler: async (req: any, res: any) => {
      const { db } = req;
      const { redemptionId } = req.params;

      let redemption = await RewardRedemptionService.getById({
        db,
        id: redemptionId,
      });

      res.status(200).json(redemption);
    },
  }),
);
