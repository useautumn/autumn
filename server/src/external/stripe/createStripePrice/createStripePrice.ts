import {
  getBillingType,
  getPriceEntitlement,
  priceIsOneOffAndTiered,
} from "@/internal/prices/priceUtils.js";
import {
  Price,
  EntitlementWithFeature,
  Product,
  Organization,
  UsagePriceConfig,
  BillingType,
  FeatureOptions,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { createStripeFixedPrice } from "./createStripeFixedPrice.js";
import { createStripePrepaid } from "./createStripePrepaid.js";
import { createStripeOneOffTieredProduct } from "./createStripeOneOffTiered.js";
import { createStripeInArrearPrice } from "./createStripeInArrear.js";
import { createStripeArrearProrated } from "./createStripeArrearProrated.js";

export const checkCurStripePrice = async ({
  price,
  stripeCli,
}: {
  price: Price;
  stripeCli: Stripe;
}) => {
  let priceValid = false;

  let config = price.config! as UsagePriceConfig;

  let stripePrice: Stripe.Price | null = null;
  if (!config.stripe_price_id) {
    stripePrice = null;
  } else {
    try {
      stripePrice = await stripeCli.prices.retrieve(config.stripe_price_id!, {
        expand: ["product"],
      });

      if (
        !stripePrice.active ||
        !(stripePrice.product as Stripe.Product).active
      ) {
        stripePrice = null;
      }
    } catch (error) {
      stripePrice = null;
    }
  }

  // Get stripe product
  let stripeProd: Stripe.Product | null = null;
  if (!config.stripe_product_id) {
    stripeProd = null;
  } else {
    try {
      stripeProd = await stripeCli.products.retrieve(config.stripe_product_id!);
      if (!stripeProd.active) {
        stripeProd = null;
      }
    } catch (error) {
      stripeProd = null;
    }
  }

  return {
    stripePrice,
    stripeProd,
  };
};

export const createStripePriceIFNotExist = async ({
  sb,
  stripeCli,
  price,
  entitlements,
  product,
  org,
  logger,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  price: Price;
  entitlements: EntitlementWithFeature[];
  product: Product;
  org: Organization;
  logger: any;
}) => {
  // Fetch latest price data...

  const billingType = getBillingType(price.config!);

  // let config = price.config! as UsagePriceConfig;
  let { stripePrice, stripeProd } = await checkCurStripePrice({
    price,
    stripeCli,
  });

  price.config!.stripe_price_id = stripePrice?.id;
  (price.config! as UsagePriceConfig).stripe_product_id = stripeProd?.id;

  let relatedEnt = getPriceEntitlement(price, entitlements);
  let isOneOffAndTiered = priceIsOneOffAndTiered(price, relatedEnt);

  // 1. If fixed price, just create price
  if (
    billingType == BillingType.FixedCycle ||
    billingType == BillingType.OneOff
  ) {
    await createStripeFixedPrice({
      sb,
      stripeCli,
      price,
      product,
      org,
      curStripePrice: stripePrice,
    });
  }

  // 2. If prepaid
  if (billingType == BillingType.UsageInAdvance) {
    if (isOneOffAndTiered && !stripeProd) {
      logger.info(`Creating stripe one off tiered product`);
      await createStripeOneOffTieredProduct({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
      });
    }

    if (!isOneOffAndTiered && !stripePrice) {
      logger.info(`Creating stripe prepaid price`);
      await createStripePrepaid({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
        curStripeProd: stripeProd,
      });
    }
  }

  if (billingType == BillingType.InArrearProrated) {
    if (!stripePrice) {
      logger.info(`Creating stripe in arrear prorated product`);
      await createStripeArrearProrated({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
        curStripeProd: stripeProd,
      });
    }
  }

  if (billingType == BillingType.UsageInArrear) {
    if (!stripePrice) {
      logger.info(
        `Creating stripe in arrear price for ${relatedEnt.feature.name}`
      );
      await createStripeInArrearPrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
        logger,
      });
    }
  }
};
