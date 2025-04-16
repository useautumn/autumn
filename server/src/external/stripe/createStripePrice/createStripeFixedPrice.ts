import Stripe from "stripe";
import { PriceService } from "@/internal/prices/PriceService.js";
import { Price, Product, Organization, FixedPriceConfig } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import { Decimal } from "decimal.js";

export const createStripeFixedPrice = async ({
  sb,
  stripeCli,
  price,
  product,
  org,
  curStripePrice,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  price: Price;
  product: Product;
  org: Organization;
  curStripePrice: Stripe.Price | null;
}) => {
  if (curStripePrice) {
    return;
  }

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
    sb,
    priceId: price.id!,
    update: { config },
  });
};
