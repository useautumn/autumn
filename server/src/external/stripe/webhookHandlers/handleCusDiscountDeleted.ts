import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { createStripeCli } from "../utils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { notNullish, timeout } from "@/utils/genUtils.js";

export const handleDiscountCompleted = async ({
  sb,
  stripeCusId,
  stripeCli,
  logger,
}: {
  sb: SupabaseClient;
  stripeCusId: string;
  stripeCli: Stripe;
  logger: any;
}) => {
  logger.info(`Checking discount completed`);
  let customer = await CusService.getByStripeId({
    sb,
    stripeId: stripeCusId,
  });

  if (!customer) {
    logger.warn(
      `Checking discount completed: customer ${stripeCusId} not found`
    );
    return;
  }

  // Check if any redemptions available, and apply to customer if so
  let redemptions = await RewardRedemptionService.getUnappliedRedemptions({
    sb,
    internalCustomerId: customer.internal_id,
  });

  if (redemptions.length == 0) {
    logger.info(
      `Checking discount completed: no redemptions available for customer ${customer.id}`
    );
    return;
  }

  let redemption = redemptions[0];
  let reward = redemption.reward_program.reward;

  let stripeCus = (await stripeCli.customers.retrieve(
    stripeCusId
  )) as Stripe.Customer;

  if (stripeCus && notNullish(stripeCus.discount)) {
    logger.info(
      `Checking discount completed: stripe customer ${stripeCusId} already has a discount`
    );
    return;
  }

  await stripeCli.customers.update(stripeCusId, {
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
    `Checking discount completed: applied reward ${reward.name} on customer ${customer.name} (${customer.id})`
  );

  logger.info(`Redemption ID: ${redemption.id}`);
};

export async function handleCusDiscountDeleted({
  sb,
  org,
  discount,
  env,
  logger,
  res,
}: {
  sb: any;
  org: any;
  discount: any;
  env: any;
  logger: any;
  res: any;
}) {
  let customer = await CusService.getByStripeId({
    sb,
    stripeId: discount.customer,
  });

  if (!customer) {
    logger.warn(`discount.deleted: customer ${discount.customer} not found`);
    return;
  }

  if (customer.env !== env || customer.org_id !== org.id) {
    logger.info(`discount.deleted: env or org mismatch, skipping`);
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
  let reward = redemption.reward_program.reward;

  // Apply redemption to customer
  let stripeCli = createStripeCli({
    org,
    env,
  });

  let stripeCus = (await stripeCli.customers.retrieve(
    discount.customer
  )) as Stripe.Customer;

  if (stripeCus && notNullish(stripeCus.discount)) {
    logger.info(
      `discount.deleted: stripe customer ${discount.customer} already has a discount`
    );
    return;
  }

  // Send response first...?
  res.status(200).json({ message: "OK" });

  if (notNullish(stripeCus.test_clock)) {
    // Time out for test clock to complete
    await timeout(5000);
  }

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
