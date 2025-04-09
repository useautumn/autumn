import { RewardRedemptionService } from "./RewardRedemptionService.js";
import { RewardTriggerEvent } from "@autumn/shared";
import { triggerRedemption } from "./referralUtils.js";
import { RewardProgramService } from "../rewards/RewardProgramService.js";
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
      withRewardProgram: true,
      triggered: false,
      withReferralCode: true,
      triggerWhen: RewardTriggerEvent.Checkout,
    });

    for (let redemption of redemptions) {
      if (
        !redemption ||
        redemption.reward_program.when !== RewardTriggerEvent.Checkout
      ) {
        return;
      }

      let { reward_program, referral_code: referralCode } = redemption;
      let { reward } = reward_program;

      logger.info(`--------------------------------`);
      logger.info(`CHECKING FOR CHECKOUT REWARD, ORG: ${org.slug}`);
      logger.info(
        `Redeemed by: ${customer.name} (${customer.id}) for referral program: ${reward_program.id}`
      );
      logger.info(`Referral code: ${referralCode.code} (${referralCode.id})`);

      if (!reward_program.product_ids.includes(product.id)) {
        logger.info(
          `Product ${product.name} (${product.id}) not included in referral program, skipping`
        );
        return;
      }

      // Get redemption count
      let redemptionCount = await RewardProgramService.getCodeRedemptionCount({
        sb,
        referralCodeId: referralCode.id,
      });

      if (redemptionCount >= reward_program.max_redemptions) {
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
};
