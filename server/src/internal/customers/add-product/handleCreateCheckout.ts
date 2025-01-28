import { createStripeCli } from "@/external/stripe/utils.js";
import {
  AppEnv,
  EntitlementWithFeature,
  FeatureOptions,
  FreeTrial,
  Price,
} from "@autumn/shared";
import { Organization } from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import { Customer } from "@autumn/shared";
import {
  getStripeSubItems,
  pricesContainRecurring,
} from "@/internal/prices/priceUtils.js";
import { PricesInput } from "@autumn/shared";
import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";

export const handleCreateCheckout = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  console.log(
    `Creating checkout for customer ${attachParams.customer.id}, product ${attachParams.product.name}`
  );

  const { customer, org, freeTrial } = attachParams;

  const stripeCli = createStripeCli({
    org,
    env: customer.env,
  });

  // Get stripeItems
  const stripeItems = getStripeSubItems({
    attachParams,
  });

  const isRecurring = pricesContainRecurring(attachParams.prices);

  // Insert metadata
  const metaId = await createCheckoutMetadata({
    sb: req.sb,
    attachParams,
  });

  const subscriptionData =
    freeTrial && isRecurring
      ? {
          trial_end: freeTrialToStripeTimestamp(freeTrial),
        }
      : undefined;

  const checkout = await stripeCli.checkout.sessions.create({
    customer: customer.processor.id,
    line_items: stripeItems,
    subscription_data: subscriptionData,
    mode: isRecurring ? "subscription" : "payment",
    currency: org.default_currency,
    success_url: org.stripe_config!.success_url,
    metadata: {
      autumn_metadata_id: metaId,
    },
  });

  res.status(200).json({ checkout_url: checkout.url });
  return;
};
