import { createStripeCli } from "@/external/stripe/utils.js";

import { pricesContainRecurring } from "@/internal/prices/priceUtils.js";

import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { BillingType, FixedPriceConfig } from "@autumn/shared";
import { differenceInDays, format } from "date-fns";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
export const handleCreateCheckout = async ({
  sb,
  res,
  attachParams,
}: {
  sb: SupabaseClient;
  res: any;
  attachParams: AttachParams;
}) => {
  console.log(
    `Creating checkout for customer ${attachParams.customer.id}, product ${attachParams.product.name}`
  );

  const { customer, org, freeTrial, curCusProduct } = attachParams;

  const stripeCli = createStripeCli({
    org,
    env: customer.env,
  });

  // Get stripeItems
  const { items, itemMetas } = await getStripeSubItems({
    attachParams,
    isCheckout: true,
  });

  const isRecurring = pricesContainRecurring(attachParams.prices);

  // Insert metadata
  const metaId = await createCheckoutMetadata({
    sb,
    attachParams,
    itemMetas,
  });

  const subscriptionData =
    freeTrial && isRecurring
      ? {
          trial_end: freeTrialToStripeTimestamp(freeTrial),
          // trial_
        }
      : undefined;

  const checkout = await stripeCli.checkout.sessions.create({
    customer: customer.processor.id,
    line_items: items,
    subscription_data: subscriptionData,
    mode: isRecurring ? "subscription" : "payment",
    currency: org.default_currency,
    success_url: org.stripe_config!.success_url,
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

  res.status(200).json({ checkout_url: checkout.url });
  return;
};
