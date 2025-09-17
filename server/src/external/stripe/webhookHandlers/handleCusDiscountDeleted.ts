import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { createStripeCli } from "../utils.js";
import Stripe from "stripe";
import { notNullish, timeout } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { RewardService } from "@/internal/rewards/RewardService.js";

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

  // Check if any redemptions available, and apply to customer if so
  let redemptions = await RewardRedemptionService.getUnappliedRedemptions({
    db,
    internalCustomerId: customer.internal_id,
  });

  logger.info(
    `discount.deleted:, discount ID: ${discount.id}, found ${redemptions.length} redemptions`
  );

  if (redemptions.length == 0) return;

  let paidProductRedemption = redemptions.find(
    (r) =>
      r.reward_program.reward.id ===
      (typeof discount.coupon == "string"
        ? discount.coupon
        : discount.coupon.id)
  );

  if (discount.subscription) {
    logger.info(
      `Discount is a subscription, paidProductRedemption: ${paidProductRedemption?.id}`
    );

    if (!paidProductRedemption) return;

    // Re-apply coupon and mark applied / redeemer applied to true
    let stripeCli = createStripeCli({
      org,
      env,
    });

    // Mark reward redemption as applied / redeemer applied to true

    const sub = await stripeCli.subscriptions.retrieve(discount.subscription);

    // can't really test because it modifies subscription affected by test clock...
    try {
      await stripeCli.subscriptions.update(discount.subscription, {
        discounts: [
          ...(sub.discounts as string[]).map((d: string) => ({
            discount: d,
          })),
          {
            coupon: paidProductRedemption.reward_program.reward.id as string,
          },
        ],
      });
    } catch (error: any) {
      logger.error(
        `Failed to update subscription ${discount.subscription} with paid product coupon, error: ${error.message}`
      );
      throw error;
    }

    // Mark reward redemption as applied / redeemer applied to true
    const isReferrer =
      paidProductRedemption.referral_code.internal_customer_id ===
      customer.internal_id;

    await RewardRedemptionService.update({
      db,
      id: paidProductRedemption.id,
      updates: {
        applied: isReferrer ? true : undefined,
        redeemer_applied: isReferrer ? undefined : true,
      },
    });

    return;
  }

  let redemption = redemptions[0];

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

  const reward = await RewardService.get({
    db,
    orgId: org.id,
    env,
    idOrInternalId: redemption.reward_program.internal_reward_id!,
  });

  if (!reward) {
    logger.warn(
      `discount.deleted: reward ${redemption.reward_program.internal_id} not found`
    );
    return;
  }

  const legacyStripe = createStripeCli({
    org,
    env,
    legacyVersion: true,
  });

  await legacyStripe.customers.update(discount.customer, {
    // @ts-ignore
    coupon: reward.id,
  });

  await RewardRedemptionService.update({
    db,
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
