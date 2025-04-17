import Stripe from "stripe";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  AppEnv,
  CouponDurationType,
  FullCusProduct,
  InvoiceStatus,
  Organization,
  Reward,
  RewardType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { createStripeCli } from "../utils.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { Decimal } from "decimal.js";
import { generateId, nullish } from "@/utils/genUtils.js";
import {
  getInvoiceDiscounts,
  getStripeExpandedInvoice,
  updateInvoiceIfExists,
} from "../stripeInvoiceUtils.js";
import { getStripeSubs } from "../stripeSubUtils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";

const handleOneOffInvoicePaid = async ({
  sb,
  stripeInvoice,
  logger,
}: {
  sb: SupabaseClient;
  stripeInvoice: Stripe.Invoice;
  event: Stripe.Event;
  logger: any;
}) => {
  // Search for invoice
  const invoice = await InvoiceService.getInvoiceByStripeId({
    sb,
    stripeInvoiceId: stripeInvoice.id,
  });

  if (!invoice) {
    console.log(`Invoice not found`);
    return;
  }

  // Update invoice status
  await InvoiceService.updateByStripeId({
    sb,
    stripeInvoiceId: stripeInvoice.id,
    updates: {
      status: stripeInvoice.status as InvoiceStatus,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
      discounts: getInvoiceDiscounts({
        expandedInvoice: stripeInvoice,
        logger,
      }),
    },
  });

  console.log(`Updated one off invoice status to ${stripeInvoice.status}`);
};

const convertToChargeAutomatically = async ({
  sb,
  org,
  env,
  invoice,
  activeCusProducts,
  logger,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  invoice: Stripe.Invoice;
  activeCusProducts: FullCusProduct[];
  logger: any;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const subs = await getStripeSubs({
    stripeCli,
    subIds: activeCusProducts.flatMap((p) => p.subscription_ids || []),
  });

  if (
    subs.every((s) => s.collection_method === "charge_automatically") ||
    nullish(invoice.payment_intent)
  ) {
    return;
  }

  // Try to attach payment method to subscription
  try {
    logger.info(`Converting to charge automatically`);
    // 1. Get payment intent
    const paymentIntent = await stripeCli.paymentIntents.retrieve(
      invoice.payment_intent as string
    );

    // 2. Get payment method
    const paymentMethod = await stripeCli.paymentMethods.retrieve(
      paymentIntent.payment_method as string
    );

    await stripeCli.paymentMethods.attach(paymentMethod.id, {
      customer: invoice.customer as string,
    });

    const batchUpdateSubs = [];
    const updateSub = async (sub: Stripe.Subscription) => {
      try {
        await stripeCli.subscriptions.update(sub.id, {
          collection_method: "charge_automatically",
          default_payment_method: paymentMethod.id,
        });
      } catch (error) {
        logger.warn(
          `Convert to charge automatically: error updating subscription ${sub.id}`
        );
        logger.warn(error);
      }
    };

    for (const sub of subs) {
      batchUpdateSubs.push(updateSub(sub));
    }

    await Promise.all(batchUpdateSubs);

    logger.info("Convert to charge automatically successful!");
  } catch (error) {
    logger.warn(`Convert to charge automatically failed: ${error}`);
  }
};

export const handleInvoicePaid = async ({
  req,
  sb,
  org,
  invoice,
  env,
  event,
}: {
  req: any;
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  env: AppEnv;
  event: Stripe.Event;
}) => {
  const logger = req.logtail;
  // 1. Get total invoice discounts

  // Fetch expanded invoice
  const stripeCli = createStripeCli({ org, env });
  const expandedInvoice = await getStripeExpandedInvoice({
    stripeCli,
    stripeInvoiceId: invoice.id,
  });

  await handleInvoicePaidDiscount({
    sb,
    expandedInvoice,
    org,
    env,
    logger,
  });

  if (invoice.subscription) {
    // Get customer product
    const activeCusProducts = await CusProductService.getByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
    });

    if (!activeCusProducts || activeCusProducts.length === 0) {
      // TODO: Send alert
      if (invoice.livemode) {
        req.logger.warn(
          `invoice.paid: customer product not found for invoice ${invoice.id}`
        );
        req.logger.warn(`Organization: ${org?.slug}`);
        req.logger.warn(`Invoice subscription: ${invoice.subscription}`);
        req.logger.warn(`Invoice customer: ${invoice.customer}`);
      } else {
        console.log(
          `Skipping invoice.paid: customer product not found for invoice ${invoice.id} (${org.slug}) (non-livemode)`
        );
      }

      return;
    }

    if (org.config.convert_to_charge_automatically) {
      await convertToChargeAutomatically({
        sb,
        org,
        env,
        invoice,
        activeCusProducts,
        logger,
      });
    }

    let updated = await updateInvoiceIfExists({
      sb,
      invoice,
    });

    if (!updated) {
      await InvoiceService.createInvoiceFromStripe({
        sb,
        stripeInvoice: expandedInvoice,
        internalCustomerId: activeCusProducts[0].internal_customer_id,
        productIds: activeCusProducts.map((p) => p.product_id),
        internalProductIds: activeCusProducts.map((p) => p.internal_product_id),
        org: org,
      });
    }

    for (const cusProd of activeCusProducts) {
      try {
        await addTaskToQueue({
          jobName: JobName.TriggerCheckoutReward,
          payload: {
            customer: cusProd.customer,
            product: cusProd.product,
            org,
            env: cusProd.customer.env,
            subId: cusProd.subscription_ids?.[0],
          },
        });
      } catch (error) {
        logger.error(`invoice.paid: failed to trigger checkout reward check`);
        logger.error(error);
      }
    }
  } else {
    await handleOneOffInvoicePaid({
      sb,
      stripeInvoice: expandedInvoice,
      event,
      logger: req.logger,
    });
  }
};

const handleInvoicePaidDiscount = async ({
  sb,
  expandedInvoice,
  org,
  env,
  logger,
}: {
  sb: SupabaseClient;
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
      // console.log("Cur coupon:", curCoupon);
      const rollSuffixIndex = curCoupon.id.indexOf("_roll_");
      const couponId =
        rollSuffixIndex !== -1
          ? curCoupon.id.substring(0, rollSuffixIndex)
          : curCoupon.id;

      // 1. Fetch coupon from Autumn
      const autumnReward: Reward | null = await RewardService.getByInternalId({
        sb,
        internalId: couponId,
        orgId: org.id,
        env,
      });

      if (
        !autumnReward ||
        autumnReward.type !== RewardType.FixedDiscount ||
        !(
          autumnReward.discount_config?.duration_type ===
            CouponDurationType.OneOff &&
          autumnReward.discount_config?.should_rollover
        )
      ) {
        continue;
      }

      // Get ID of coupon
      const originalCoupon = await stripeCli.coupons.retrieve(couponId, {
        expand: ["applies_to"],
      });

      // console.log("Total discount amounts", totalDiscountAmounts);
      // console.log("Autumn reward", autumnReward);

      // 1. New amount:
      // const autumnDiscountConfig = autumnReward.discount_config!;
      const curAmount = discount.coupon.amount_off;

      const amountUsed = totalDiscountAmounts?.find(
        (item) => item.discount === discount.id
      )?.amount;

      const newAmount = new Decimal(curAmount!).sub(amountUsed!).toNumber();

      if (newAmount <= 0) {
        console.log("Credits used up, no need to create new coupon");
        continue;
      }

      console.log(`Updating coupon amount from ${curAmount} to ${newAmount}`);

      const newCoupon = await stripeCli.coupons.create({
        id: `${couponId}_${generateId("roll")}`,
        name: discount.coupon.name as string,
        amount_off: newAmount,
        currency: expandedInvoice.currency,
        duration: "once",
        applies_to: originalCoupon.applies_to,
      });

      await stripeCli.customers.update(expandedInvoice.customer as string, {
        coupon: newCoupon.id,
      });

      await stripeCli.coupons.del(newCoupon.id);

      if (expandedInvoice.subscription && curCoupon.duration == "forever") {
        try {
          await stripeCli.subscriptions.deleteDiscount(
            expandedInvoice.subscription as string
          );
          console.log("Deleting current discount from subscription");
        } catch (error: any) {
          logger.error(
            `Failed to remove coupon from subscription ${expandedInvoice.subscription}`
          );
          logger.error(error.message);
        }
      }
    }
  } catch (error) {
    logger.error("invoice.paid: error updating coupon");
    logger.error(error);
  }
};
