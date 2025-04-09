import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { createStripeCli } from "../utils.js";

export async function handleCusDiscountDeleted({
  sb,
  org,
  discount,
  env,
  logger,
}: {
  sb: any;
  org: any;
  discount: any;
  env: any;
  logger: any;
}) {
  let customer = await CusService.getByStripeId({
    sb,
    stripeId: discount.customer,
  });

  if (customer.env !== env || customer.org_id !== org.id) {
    logger.info(`discount.deleted: env or org mismatch, skipping`);
    return;
  }

  if (!customer) {
    logger.warn(`discount.deleted: customer ${discount.customer} not found`);
    return;
  }

  // Check if any redemptions available, and apply to customer if so
  let redemptions = await RewardRedemptionService.getUnappliedRedemptions({
    sb,
    internalCustomerId: customer.internal_id,
  });

  if (redemptions.length == 0) {
    // logger.info(
    //   `discount.deleted: no redemptions available for customer ${customer.id}`
    // );
    return;
  }

  let redemption = redemptions[0];
  let reward = redemption.reward_trigger.reward;

  // Apply redemption to customer
  let stripeCli = createStripeCli({
    org,
    env,
  });

  await stripeCli.customers.update(discount.customer, {
    coupon: reward.internal_id,
  });

  await RewardRedemptionService.update({
    sb,
    id: redemption.id,
    updates: {
      applied: true,
    },
  });

  logger.info(
    `discount.deleted: applied reward ${reward.name} on customer ${customer.name} (${customer.id})`
  );
  logger.info(`Redemption ID: ${redemption.id}`);
}
