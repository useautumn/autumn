import { createStripeCli } from "@/external/stripe/utils.js";

import { pricesContainRecurring } from "@/internal/prices/priceUtils.js";

import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";

import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  addBillingIntervalUnix,
  getNextStartOfMonthUnix,
  subtractBillingIntervalUnix,
  subtractFromUnixTillAligned,
} from "@/internal/prices/billingIntervalUtils.js";
import { format } from "date-fns";

export const handleCreateCheckout = async ({
  sb,
  req,
  res,
  attachParams,
}: {
  sb: SupabaseClient;
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const logger = req.logtail;

  const { customer, org, freeTrial, successUrl } = attachParams;

  const stripeCli = createStripeCli({
    org,
    env: customer.env,
  });

  // Get stripeItems
  const itemSets = await getStripeSubItems({
    attachParams,
    isCheckout: true,
  });

  if (itemSets.length === 0) {
    throw new RecaseError({
      code: ErrCode.ProductHasNoPrices,
      message: "Product has no prices",
    });
  }

  // Handle first item set
  const { items, itemMetas, subMeta } = itemSets[0];
  attachParams.itemSets = itemSets;

  const isRecurring = pricesContainRecurring(attachParams.prices);

  // Insert metadata
  const metaId = await createCheckoutMetadata({
    sb,
    attachParams,
    itemMetas,
  });

  let billingCycleAnchorUnixSeconds = org.config.anchor_start_of_month
    ? Math.floor(getNextStartOfMonthUnix(itemSets[0].interval) / 1000)
    : undefined;

  if (attachParams.billingAnchor) {
    billingCycleAnchorUnixSeconds = Math.floor(
      attachParams.billingAnchor / 1000
    );
  }

  const subscriptionData = isRecurring
    ? {
        trial_end: freeTrial
          ? freeTrialToStripeTimestamp(freeTrial)
          : undefined,
        metadata: subMeta,
        billing_cycle_anchor: billingCycleAnchorUnixSeconds,
      }
    : undefined;

  const checkout = await stripeCli.checkout.sessions.create({
    customer: customer.processor.id,
    line_items: items,
    subscription_data: subscriptionData,
    mode: isRecurring ? "subscription" : "payment",
    currency: org.default_currency,
    success_url: successUrl || org.stripe_config!.success_url,
    metadata: {
      autumn_metadata_id: metaId,
    },
    allow_promotion_codes: true,
    invoice_creation: !isRecurring
      ? {
          enabled: true,
        }
      : undefined,
  });

  logger.info(`✅ Successfully created checkout for customer ${customer.id}`);

  res.status(200).json({
    checkout_url: checkout.url,
  });
  return;
};

// OLD BILLING CYCLE ANCHOR LOGIC
// const nextBillingDateUnix = addBillingIntervalUnix(
//   Date.now(),
//   itemSets[0].interval
// );
// console.log(
//   "Next billing date",
//   format(new Date(nextBillingDateUnix), "dd MMM yyyy HH:mm:ss")
// );
// console.log(
//   "Target unix",
//   format(new Date(attachParams.billingAnchor), "dd MMM yyyy HH:mm:ss")
// );

// billingCycleAnchorUnixSeconds = subtractFromUnixTillAligned({
//   targetUnix: attachParams.billingAnchor,
//   originalUnix: nextBillingDateUnix,
// });

// console.log(
//   "Billing cycle anchor",
//   format(new Date(billingCycleAnchorUnixSeconds), "dd MMM yyyy HH:mm:ss")
// );

// billingCycleAnchorUnixSeconds = Math.floor(
//   billingCycleAnchorUnixSeconds / 1000
// );
