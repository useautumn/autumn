import Stripe from "stripe";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { Price, Product, Organization, FixedPriceConfig } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import { Decimal } from "decimal.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const createStripeFixedPrice = async ({
  db,
  stripeCli,
  price,
  product,
  org,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  price: Price;
  product: Product;
  org: Organization;
}) => {
  const config = price.config as FixedPriceConfig;

  let amount = new Decimal(config.amount).mul(100).toNumber();

  const stripePrice = await stripeCli.prices.create({
    product: product.processor!.id,
    unit_amount: amount,
    currency: org.default_currency,
    recurring: {
      ...(billingIntervalToStripe(config.interval!) as any),
    },

    nickname: `Autumn Price (Fixed)`,
  });

  config.stripe_price_id = stripePrice.id;

  await PriceService.update({
    db,
    id: price.id!,
    update: { config },
  });
};
