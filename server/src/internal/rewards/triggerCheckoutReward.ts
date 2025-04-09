import { createStripeCli } from "@/external/stripe/utils.js";
import { RewardRedemptionService } from "./RewardRedemptionService.js";
import { RewardTriggerService } from "./RewardTriggerService.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "../customers/CusService.js";
import Stripe from "stripe";
import { RewardTriggerEvent } from "@autumn/shared";
import { triggerRedemption } from "./referralUtils.js";

export const runTriggerCheckoutReward = async ({
  sb,
  payload,
  logger,
}: {
  sb: any;
  payload: any;
  logger: any;
}) => {
  try {
    // Customer redeeming code, product they're buying
    let { customer, product, org, env } = payload;

    // 1. Check if redemption exists
    let redemptions = await RewardRedemptionService.getByCustomer({
      sb,
      internalCustomerId: customer.internal_id, // customer that redeemed code
      withRewardTrigger: true,
      triggered: false,
      withReferralCode: true,
      triggerWhen: RewardTriggerEvent.Checkout,
    });

    for (let redemption of redemptions) {
      if (
        !redemption ||
        redemption.reward_trigger.when !== RewardTriggerEvent.Checkout
      ) {
        return;
      }

      let { reward_trigger, referral_code: referralCode } = redemption;
      let { reward } = reward_trigger;

      logger.info(`--------------------------------`);
      logger.info(`CHECKING FOR CHECKOUT REWARD, ORG: ${org.slug}`);
      logger.info(
        `Redeemed by: ${customer.name} (${customer.id}) for referral program: ${reward_trigger.id}`
      );
      logger.info(`Referral code: ${referralCode.code} (${referralCode.id})`);

      if (!reward_trigger.product_ids.includes(product.id)) {
        logger.info(
          `Product ${product.name} (${product.id}) not included in referral program, skipping`
        );
        return;
      }

      // Get redemption count
      let redemptionCount = await RewardTriggerService.getCodeRedemptionCount({
        sb,
        referralCodeId: referralCode.id,
      });

      if (redemptionCount >= reward_trigger.max_redemptions) {
        logger.info(
          `Max redemptions reached, not triggering latest redemption`
        );
        return;
      }

      await triggerRedemption({
        sb,
        referralCode,
        org,
        env,
        logger,
        reward,
        redemption,
      });
    }
  } catch (error) {
    logger.error("Failed to trigger checkout reward");
    logger.error(error);
  }

  // let { reward_trigger } = redemption;
  // let { reward } = reward_trigger;

  // let customerToApplyDiscount = redemption.code.internal_customer_id;

  // console.log("Customer to apply discount", customerToApplyDiscount);
};
