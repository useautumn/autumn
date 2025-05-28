import { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import {
  EntitlementWithFeature,
  Price,
  Product,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const createStripeOneOffTieredProduct = async ({
  db,
  stripeCli,
  price,
  entitlements,
  product,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  price: Price;
  entitlements: EntitlementWithFeature[];
  product: Product;
}) => {
  let config = price.config as UsagePriceConfig;
  let relatedEnt = getPriceEntitlement(price, entitlements);
  let productName = `${product.name} - ${
    config.billing_units == 1 ? "" : `${config.billing_units} `
  }${relatedEnt.feature.name}`;

  let stripeProduct = await stripeCli.products.create({
    name: productName,
  });

  config.stripe_product_id = stripeProduct.id;

  await PriceService.update({
    db,
    id: price.id!,
    update: { config },
  });
};
