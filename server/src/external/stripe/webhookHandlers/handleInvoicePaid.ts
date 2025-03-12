import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, InvoiceStatus, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { CouponService } from "@/internal/coupons/CouponService.js";
import { Decimal } from "decimal.js";
import { generateId } from "@/utils/genUtils.js";
import {
  getInvoiceDiscounts,
  getStripeExpandedInvoice,
} from "../stripeInvoiceUtils.js";

const handleOneOffInvoicePaid = async ({
  sb,
  stripeInvoice,
}: {
  sb: SupabaseClient;
  stripeInvoice: Stripe.Invoice;
  event: Stripe.Event;
}) => {
  // Search for invoice
  const invoice = await InvoiceService.getInvoiceByStripeId({
    sb,
    stripeInvoiceId: stripeInvoice.id,
  });

  if (!invoice) {
    console.log(`Invoice not found`);
  }

  // Update invoice status
  await InvoiceService.updateByStripeId({
    sb,
    stripeInvoiceId: stripeInvoice.id,
    updates: {
      status: stripeInvoice.status as InvoiceStatus,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
    },
  });

  console.log(`Updated one off invoice status to ${stripeInvoice.status}`);
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
  // 1. Get total invoice discounts

  // Fetch expanded invoice
  const stripeCli = createStripeCli({ org, env });
  const expandedInvoice = await getStripeExpandedInvoice({
    stripeCli,
    stripeInvoiceId: invoice.id,
  });

  const discountAmounts = getInvoiceDiscounts({
    expandedInvoice,
    logger: req.logger,
  });

  console.log("Discount amounts", discountAmounts);

  await handleInvoicePaidDiscount({
    sb,
    expandedInvoice,
    org,
    env,
    logger: req.logger,
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

    console.log(`Invoice paid handled ${org.slug} ${invoice.id}`);

    let existingInvoice = await InvoiceService.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: invoice.id,
    });

    if (existingInvoice) {
      console.log(`Invoice already exists`);
      await InvoiceService.updateByStripeId({
        sb,
        stripeInvoiceId: invoice.id,
        updates: {
          status: invoice.status as InvoiceStatus,
        },
      });
      console.log(`Updated invoice status to ${invoice.status}`);
      return;
    }

    // console.log("Handling invoice.paid:", invoice.id);

    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: expandedInvoice,
      internalCustomerId: activeCusProducts[0].internal_customer_id,
      productIds: activeCusProducts.map((p) => p.product_id),
      internalProductIds: activeCusProducts.map((p) => p.internal_product_id),
      org: org,
    });
  } else {
    await handleOneOffInvoicePaid({
      sb,
      stripeInvoice: expandedInvoice,
      event,
    });
  }

  // Else, handle one-off invoice
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
      console.log("Cur coupon:", curCoupon);
      const rollSuffixIndex = curCoupon.id.indexOf("_roll_");
      const couponId =
        rollSuffixIndex !== -1
          ? curCoupon.id.substring(0, rollSuffixIndex)
          : curCoupon.id;

      // 1. Fetch coupon from Autumn
      const autumnCoupon = await CouponService.getByInternalId({
        sb,
        internalId: couponId,
        orgId: org.id,
        env,
      });

      if (!autumnCoupon) {
        continue;
      }

      console.log("Found autumn coupon", autumnCoupon);

      // 1. New amount:
      const curAmount = discount.coupon.amount_off;
      const amountUsed = totalDiscountAmounts?.find(
        (item) => item.discount === discount.id
      )?.amount;

      const newAmount = new Decimal(curAmount!).sub(amountUsed!).toNumber();

      // if (amountUsed == 0) {
      //   console.log("No discount used, skipping");
      //   continue;
      // }

      console.log(`Updating coupon amount from ${curAmount} to ${newAmount}`);

      // Create new coupon with that amount off
      const newCoupon = await stripeCli.coupons.create({
        id: `${couponId}_${generateId("roll")}`,
        name: discount.coupon.name as string,
        amount_off: newAmount,
        currency: expandedInvoice.currency,
        duration: "once",
        applies_to: curCoupon.applies_to,
      });

      await stripeCli.customers.update(expandedInvoice.customer as string, {
        coupon: newCoupon.id,
      });

      await stripeCli.coupons.del(newCoupon.id);
    }
  } catch (error) {
    logger.error("invoice.paid: error updating coupon");
    logger.error(error);
  }
};
