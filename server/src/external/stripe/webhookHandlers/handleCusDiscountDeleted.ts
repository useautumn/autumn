import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { createStripeCli } from "../utils.js";
import Stripe from "stripe";
import { notNullish, timeout } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export async function handleCusDiscountDeleted({
  db,
  org,
  discount,
  env,
  logger,
  res,
}: {
  db: DrizzleCli;
  org: any;
  discount: any;
  env: any;
  logger: any;
  res: any;
}) {
  let customer = await CusService.getByStripeId({
    db,
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

  res.status(200).json({ message: "OK" });
  return;

  // // Check if any redemptions available, and apply to customer if so
  // let redemptions = await RewardRedemptionService.getUnappliedRedemptions({
  //   db,
  //   internalCustomerId: customer.internal_id,
  // });

  // if (redemptions.length == 0) {
  //   return;
  // }

  // let redemption = redemptions[0];
  // let reward = redemption.reward_program.reward;

  // // Apply redemption to customer
  // let stripeCli = createStripeCli({
  //   org,
  //   env,
  // });

  // let stripeCus = (await stripeCli.customers.retrieve(
  //   discount.customer,
  // )) as Stripe.Customer;

  // if (stripeCus && notNullish(stripeCus.discount)) {
  //   logger.info(
  //     `discount.deleted: stripe customer ${discount.customer} already has a discount`,
  //   );
  //   return;
  // }

  // // Send response first...?
  // res.status(200).json({ message: "OK" });

  // if (notNullish(stripeCus.test_clock)) {
  //   // Time out for test clock to complete
  //   await timeout(5000);
  // }

  // await stripeCli.customers.update(discount.customer, {
  //   coupon: reward.internal_id,
  // });

  // await RewardRedemptionService.update({
  //   db,
  //   id: redemption.id,
  //   updates: {
  //     applied: true,
  //   },
  // });

  // logger.info(
  //   `discount.deleted: applied reward ${reward.name} on customer ${customer.name} (${customer.id})`,
  // );
  // logger.info(`Redemption ID: ${redemption.id}`);
}
