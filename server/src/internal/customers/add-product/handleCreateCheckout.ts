import { createStripeCli } from "@/external/stripe/utils.js";
import { AppEnv, EntitlementWithFeature, Price } from "@autumn/shared";
import { Organization } from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import { Customer } from "@autumn/shared";
import {
  getStripeSubItems,
  pricesContainRecurring,
} from "@/internal/prices/priceUtils.js";
import { PricesInput } from "@autumn/shared";
import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";

export const handleCreateCheckout = async ({
  req,
  res,
  customer,
  product,
  org,
  prices,
  entitlements,
  pricesInput,
  env,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  org: Organization;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  pricesInput: PricesInput;
  env: AppEnv;
}) => {
  console.log(
    `Creating checkout for customer ${customer.id}, product ${product.name}`
  );

  const stripeCli = createStripeCli({ org, env });

  // Get stripeItems
  const stripeItems = getStripeSubItems({
    product,
    prices,
    org,
    pricesInput,
  });

  const isRecurring = pricesContainRecurring(prices);

  // Insert metadata
  const metaId = await createCheckoutMetadata({
    sb: req.sb,
    org,
    customer,
    product,
    prices,
    entitlements,
    pricesInput,
    env,
  });

  const checkout = await stripeCli.checkout.sessions.create({
    customer: customer.processor.id,
    line_items: stripeItems,
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
