import { createStripeCli } from "@/external/stripe/utils.js";

import { pricesContainRecurring } from "@/internal/prices/priceUtils.js";

import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";

import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";

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

  const subscriptionData = isRecurring
    ? {
        trial_end: freeTrial
          ? freeTrialToStripeTimestamp(freeTrial)
          : undefined,
        metadata: subMeta,
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

  res.status(200).json({
    checkout_url: checkout.url,
    // success: true,
    // message: "Successfully created Stripe checkout",
  });
  return;
};
