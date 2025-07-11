import {
  getBillingType,
  getPriceEntitlement,
} from "@/internal/products/prices/priceUtils.js";
import {
  Price,
  UsagePriceConfig,
  TierInfinite,
  EntitlementWithFeature,
  Organization,
  Product,
  BillingInterval,
  BillingType,
} from "@autumn/shared";
import Stripe from "stripe";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import { priceToInArrearTiers } from "./createStripeInArrear.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { Decimal } from "decimal.js";

export interface StripeMeteredPriceParams {
  db: DrizzleCli;
  stripeCli: Stripe;
  price: Price;
  entitlements: EntitlementWithFeature[];
  product: Product;
  org: Organization;
}

export const createStripeMeteredPrice = async ({
  db,
  stripeCli,
  price,
  entitlements,
  product,
  org,
}: StripeMeteredPriceParams) => {
  const config = price.config as UsagePriceConfig;
  const ent = getPriceEntitlement(price, entitlements);
  const feature = ent.feature;

  let meter;
  try {
    meter = await stripeCli.billing.meters.create({
      display_name: `${product.name} - ${feature!.name}`,
      event_name: price.id!,
      default_aggregation: {
        formula: "sum",
      },
    });
  } catch (error: any) {
    const meters = await stripeCli.billing.meters.list({
      limit: 100,
      status: "active",
    });
    meter = meters.data.find((m) => m.event_name == price.id!);
    if (!meter) {
      throw error;
    }
  }

  const tiers = priceToInArrearTiers(price, ent);

  let priceAmountData = {};
  if (ent.allowance == 0 && tiers.length == 1) {
    priceAmountData = {
      unit_amount_decimal: tiers[0].unit_amount_decimal,
    };
  } else {
    priceAmountData = {
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: tiers,
    };
  }

  let productData = {};
  if (config.stripe_product_id) {
    productData = {
      product: config.stripe_product_id,
    };
  } else {
    productData = {
      product_data: {
        name: `${product.name} - ${feature!.name}`,
      },
    };
  }

  const stripePrice = await stripeCli.prices.create({
    ...productData,
    ...priceAmountData,
    currency: org.default_currency || "usd",
    nickname: `Autumn Price (${feature!.name}) [Placeholder]`,
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meter!.id,
      usage_type: "metered",
    },
  });

  return stripePrice;
};

export const arrearProratedToStripeTiers = (
  price: Price,
  entitlement: EntitlementWithFeature,
) => {
  let usageConfig = structuredClone(price.config) as UsagePriceConfig;

  const billingUnits = usageConfig.billing_units;
  const numFree = entitlement.allowance
    ? Math.round(entitlement.allowance! / billingUnits!)
    : 0;

  const tiers: any[] = [];

  if (numFree > 0) {
    tiers.push({
      unit_amount_decimal: 0,
      up_to: numFree,
    });
  }
  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    const tier = usageConfig.usage_tiers[i];
    // const amount = tier.amount * 100;
    const amount = new Decimal(tier.amount).mul(100).toNumber();
    const upTo =
      tier.to == -1 || tier.to == TierInfinite
        ? "inf"
        : Math.round((tier.to - numFree) / billingUnits!) + numFree;

    tiers.push({
      unit_amount_decimal: amount,
      up_to: upTo,
    });
  }

  return tiers;
};

export const createStripeArrearProrated = async ({
  db,
  price,
  product,
  org,
  entitlements,
  curStripeProd,
  stripeCli,
}: {
  db: DrizzleCli;
  price: Price;
  product: Product;
  org: Organization;
  entitlements: EntitlementWithFeature[];
  curStripeProd: Stripe.Product | null;
  stripeCli: Stripe;
}) => {
  const relatedEnt = getPriceEntitlement(price, entitlements);

  let recurringData = undefined;
  if (price.config!.interval != BillingInterval.OneOff) {
    recurringData = billingIntervalToStripe(price.config!.interval!);
  }

  const config = price.config as UsagePriceConfig;

  // 1. Product name
  let productName = `${product.name} - ${
    config.billing_units == 1 ? "" : `${config.billing_units} `
  }${relatedEnt.feature.name}`;

  let productData = curStripeProd
    ? { product: curStripeProd.id }
    : {
        product_data: {
          name: productName,
        },
      };

  // let tiers = arrearProratedToStripeTiers(price, relatedEnt);
  let tiers = priceToInArrearTiers(price, relatedEnt);

  let priceAmountData = {};
  if (tiers.length == 1) {
    priceAmountData = {
      unit_amount_decimal: tiers[0].unit_amount_decimal,
    };
  } else {
    priceAmountData = {
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: tiers,
    };
  }

  let stripePrice = await stripeCli.prices.create({
    ...productData,
    currency: org.default_currency || "usd",
    ...priceAmountData,
    recurring: {
      ...(recurringData as any),
    },
    nickname: `Autumn Price (${relatedEnt.feature.name})`,
  });

  config.stripe_price_id = stripePrice.id;
  config.stripe_product_id = stripePrice.product as string;
  let billingType = getBillingType(price.config!);

  // CREATE PLACEHOLDER PRICE FOR INARREAR PRORATED PRICING
  if (billingType == BillingType.InArrearProrated) {
    let placeholderPrice = await createStripeMeteredPrice({
      db,
      stripeCli,
      price,
      entitlements,
      product,
      org,
    });
    config.stripe_placeholder_price_id = placeholderPrice.id;
  }

  price.config = config;
  await PriceService.update({
    db,
    id: price.id!,
    update: { config },
  });
};
