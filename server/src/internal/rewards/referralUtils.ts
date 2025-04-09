import {
  AppEnv,
  ReferralCode,
  Reward,
  RewardRedemption,
  RewardTrigger,
} from "@autumn/shared";
import { RewardTriggerService } from "./RewardTriggerService.js";
import { CusService } from "../customers/CusService.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { RewardRedemptionService } from "./RewardRedemptionService.js";

export const generateReferralCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const codeLength = 6;

  let code = "";

  for (let i = 0; i < codeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
};

// Trigger reward
export const triggerRedemption = async ({
  sb,
  referralCode,
  org,
  env,
  logger,
  reward,
  redemption,
}: {
  sb: any;
  org: any;
  env: AppEnv;
  logger: any;
  referralCode: ReferralCode;
  reward: Reward;
  redemption: RewardRedemption;
}) => {
  logger.info(
    `Triggering redemption ${redemption.id} for referral code ${referralCode.code}`
  );

  let applyToCustomer = await CusService.getByInternalId({
    sb,
    internalId: referralCode.internal_customer_id,
  });

  let stripeCli = createStripeCli({
    org,
    env,
  });

  await createStripeCusIfNotExists({
    sb,
    customer: applyToCustomer,
    org,
    env,
    logger,
  });

  let stripeCusId = applyToCustomer.processor.id;
  let stripeCus = (await stripeCli.customers.retrieve(
    stripeCusId
  )) as Stripe.Customer;

  let applied = false;
  if (!stripeCus.discount) {
    await stripeCli.customers.update(stripeCusId, {
      coupon: reward.internal_id,
    });

    applied = true;
    logger.info(`Applied coupon to customer in Stripe`);
  }

  let updatedRedemption = await RewardRedemptionService.update({
    sb,
    id: redemption.id,
    updates: {
      applied,
      triggered: true,
    },
  });

  logger.info(`Successfully triggered redemption, applied: ${applied}`);

  return updatedRedemption;
};
