import { DrizzleCli } from "@/db/initDrizzle.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import {
  CouponDurationType,
  Organization,
  Reward,
  RewardType,
} from "@autumn/shared";
import { AppEnv } from "@autumn/shared";

import Stripe from "stripe";
import {
  deleteCouponFromCus,
  deleteCouponFromSub,
} from "../stripeCouponUtils/deleteCouponFromCus.js";
import { createStripeCli } from "../utils.js";
import { Decimal } from "decimal.js";
import { generateId } from "@/utils/genUtils.js";
import { addMonths } from "date-fns";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";

export const handleInvoicePaidDiscount = async ({
  db,
  expandedInvoice,
  org,
  env,
  logger,
}: {
  db: DrizzleCli;
  expandedInvoice: Stripe.Invoice;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  // Handle coupon
  const stripeCli = createStripeCli({ org, env });
  if (expandedInvoice.discounts.length === 0) {
    return;
  }

  let stripeCus = await stripeCli.customers.retrieve(
    expandedInvoice.customer as string,
  );

  try {
    const totalDiscountAmounts = expandedInvoice.total_discount_amounts;

    // Log coupon information for debugging
    for (const discount of expandedInvoice.discounts) {
      if (typeof discount === "string") {
        continue;
      }

      const curCoupon = discount.coupon;

      if (!curCoupon) {
        continue;
      }

      const rollSuffixIndex = curCoupon.id.indexOf("_roll_");
      const couponId =
        rollSuffixIndex !== -1
          ? curCoupon.id.substring(0, rollSuffixIndex)
          : curCoupon.id;

      const autumnReward: Reward | null = await RewardService.get({
        db,
        idOrInternalId: couponId,
        orgId: org.id,
        env,
      });

      let shouldRollover =
        autumnReward && autumnReward.type == RewardType.InvoiceCredits;

      if (!shouldRollover) {
        continue;
      }

      // Get ID of coupon
      const originalCoupon = await stripeCli.coupons.retrieve(couponId, {
        expand: ["applies_to"],
      });

      // 1. New amount:
      const curAmount = discount.coupon.amount_off;

      const amountUsed = totalDiscountAmounts?.find(
        (item) => item.discount === discount.id,
      )?.amount;

      const newAmount = new Decimal(curAmount!).sub(amountUsed!).toNumber();

      let curExpiresAt = curCoupon.metadata?.expires_at
        ? Number(curCoupon.metadata.expires_at)
        : null;

      let discountFinished = newAmount <= 0;

      let now = await getStripeNow({
        stripeCli,
        stripeCus: stripeCus as Stripe.Customer,
      });

      let expired = curExpiresAt && curExpiresAt < now;

      if (discountFinished || expired) {
        logger.info(
          `Coupon ${couponId}, stripeCus: ${stripeCus.id}: credits used up or expired. discountFinished: ${discountFinished}, expired: ${expired}`,
        );

        await deleteCouponFromCus({
          stripeCli,
          stripeSubId: expandedInvoice.subscription as string,
          stripeCusId: expandedInvoice.customer as string,
          discountId: discount.id,
          logger,
        });
        continue;
      }

      logger.info(
        `Coupon ${couponId}, stripeCus: ${stripeCus.id}, updating amount from ${curAmount} to ${newAmount}`,
      );

      // Set expiry date
      let expiresAt = curCoupon.metadata?.expires_at || null;
      let discountConfig = autumnReward?.discount_config;
      if (discountConfig?.duration_type == CouponDurationType.Months) {
        expiresAt = addMonths(new Date(), discountConfig.duration_value)
          .getTime()
          .toString();
      }

      const newCoupon = await stripeCli.coupons.create({
        id: `${couponId}_${generateId("roll")}`,
        name: discount.coupon.name as string,
        amount_off: newAmount,
        currency: expandedInvoice.currency,
        duration: "once",
        applies_to: originalCoupon.applies_to,
        metadata: {
          expires_at: expiresAt,
        },
      });

      await stripeCli.customers.update(expandedInvoice.customer as string, {
        coupon: newCoupon.id,
      });

      await stripeCli.coupons.del(newCoupon.id);

      await deleteCouponFromSub({
        stripeCli,
        stripeSubId: expandedInvoice.subscription as string,
        discountId: discount.id,
        logger,
      });
    }
  } catch (error) {
    logger.error("invoice.paid: error updating coupon");
    logger.error(error);
  }
};
