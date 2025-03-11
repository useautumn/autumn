import { PriceService } from "@/internal/prices/PriceService.js";
import {
  Price,
  Product,
  Organization,
  FixedPriceConfig,
  EntitlementWithFeature,
  BillingInterval,
  UsagePriceConfig,
  Entitlement,
  BillingType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { Decimal } from "decimal.js";
import Stripe from "stripe";
import { billingIntervalToStripe } from "./stripePriceUtils.js";
import {
  getBillingType,
  getPriceEntitlement,
} from "@/internal/prices/priceUtils.js";

export const createStripeMeteredPrice = async ({
  sb,
  stripeCli,
  price,
  entitlements,
  product,
  org,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  price: Price;
  entitlements: EntitlementWithFeature[];
  product: Product;
  org: Organization;
}) => {
  const config = price.config as UsagePriceConfig;
  const feature = entitlements.find(
    (e) => e.internal_feature_id === config.internal_feature_id
  )!.feature;

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

  const tiers = priceToStripeTiers(
    price,
    entitlements.find((e) => e.internal_feature_id === feature!.internal_id)!
  );

  let relatedEnt = getPriceEntitlement(price, entitlements);

  let priceAmountData = {};
  if (relatedEnt.allowance == 0 && tiers.length == 1) {
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
    currency: org.default_currency,
    nickname: `Autumn Price (${price.name}) [Placeholder]`,
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meter!.id,
      usage_type: "metered",
    },
  });

  return stripePrice;
};

export const createStripeFixedCyclePrice = async ({
  sb,
  stripeCli,
  price,
  product,
  org,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  price: Price;
  product: Product;
  org: Organization;
}) => {
  const config = price.config as FixedPriceConfig;

  let amount = new Decimal(config.amount).mul(100).toNumber();
  const stripePrice = await stripeCli.prices.create({
    product: product.processor!.id,
    // unit_amount_decimal: amount.toString(),
    unit_amount: amount,
    currency: org.default_currency,
    recurring: {
      ...(billingIntervalToStripe(config.interval!) as any),
    },
    nickname: `Autumn Price (${price.name})`,
  });

  config.stripe_price_id = stripePrice.id;

  await PriceService.update({
    sb,
    priceId: price.id!,
    update: { config },
  });
};

export const inAdvanceToStripeTiers = (
  price: Price,
  entitlement: Entitlement
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
    const amount = tier.amount * 100;
    const upTo =
      tier.to == -1
        ? "inf"
        : Math.round((tier.to - numFree) / billingUnits!) + numFree;

    tiers.push({
      unit_amount_decimal: amount,
      up_to: upTo,
    });
  }
  // console.log("Tiers:", tiers);

  return tiers;
};

export const createStripeInAdvancePrice = async ({
  sb,
  stripeCli,
  price,
  entitlements,
  product,
  org,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  price: Price;
  entitlements: EntitlementWithFeature[];
  product: Product;
  org: Organization;
}) => {
  let recurringData = undefined;
  if (price.config!.interval != BillingInterval.OneOff) {
    recurringData = billingIntervalToStripe(price.config!.interval!);
  }

  const relatedEnt = getPriceEntitlement(price, entitlements);
  const config = price.config as UsagePriceConfig;

  // If one off, just create price...?

  let stripePrice = null;
  let productName = `${product.name} - ${
    config.billing_units == 1 ? "" : `${config.billing_units} `
  }${relatedEnt.feature.name}`;

  let productData = {};
  if (config.stripe_product_id) {
    productData = {
      product: config.stripe_product_id,
    };
  } else {
    productData = {
      product_data: {
        name: productName,
      },
    };
  }

  if (price.config!.interval == BillingInterval.OneOff) {
    const amount = config.usage_tiers[0].amount;
    stripePrice = await stripeCli.prices.create({
      ...productData,
      unit_amount_decimal: (amount * 100).toString(),
      currency: org.default_currency,
    });
    config.stripe_price_id = stripePrice.id;
    return;
  } else {
    let tiers = inAdvanceToStripeTiers(price, relatedEnt);

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

    stripePrice = await stripeCli.prices.create({
      ...productData,
      currency: org.default_currency,
      ...priceAmountData,
      recurring: {
        ...(recurringData as any),
      },
      nickname: `Autumn Price (${price.name})`,
    });

    config.stripe_price_id = stripePrice.id;
    config.stripe_product_id = stripePrice.product as string;
    let billingType = getBillingType(price.config!);

    // CREATE PLACEHOLDER PRICE FOR INARREAR PRORATED PRICING
    if (billingType == BillingType.InArrearProrated) {
      let placeholderPrice = await createStripeMeteredPrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      });
      config.stripe_placeholder_price_id = placeholderPrice.id;
    }
  }

  // New config
  price.config = config;
  await PriceService.update({
    sb,
    priceId: price.id!,
    update: { config },
  });
};

export const createStripeOneOffTieredProduct = async ({
  sb,
  stripeCli,
  price,
  entitlements,
  product,
}: {
  sb: SupabaseClient;
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
    sb,
    priceId: price.id!,
    update: { config },
  });
};

// IN ARREAR
export const priceToStripeTiers = (price: Price, entitlement: Entitlement) => {
  let usageConfig = structuredClone(price.config) as UsagePriceConfig;
  const tiers: any[] = [];
  if (entitlement.allowance) {
    tiers.push({
      unit_amount: 0,
      up_to: entitlement.allowance,
    });

    for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
      usageConfig.usage_tiers[i].from += entitlement.allowance;
      if (usageConfig.usage_tiers[i].to != -1) {
        usageConfig.usage_tiers[i].to += entitlement.allowance;
      }
    }
  }

  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    const tier = usageConfig.usage_tiers[i];
    let amount = new Decimal(tier.amount)
      .div(usageConfig.billing_units ?? 1)
      .mul(100)
      .toString();

    tiers.push({
      unit_amount_decimal: amount,
      up_to: tier.to == -1 ? "inf" : tier.to,
    });
  }

  return tiers;
};

export const createStripeInArrearPrice = async ({
  sb,
  stripeCli,
  product,
  price,
  entitlements,
  org,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  product: Product;
  price: Price;
  org: Organization;
  entitlements: EntitlementWithFeature[];
}) => {
  let config = price.config as UsagePriceConfig;
  // 1. Create meter
  const feature = entitlements.find(
    (e) => e.internal_feature_id === config.internal_feature_id
  )!.feature;

  // 1. Get meter by event_name

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

  const tiers = priceToStripeTiers(
    price,
    entitlements.find((e) => e.internal_feature_id === feature!.internal_id)!
  );

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
    currency: org.default_currency,
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meter!.id,
      usage_type: "metered",
    },
    nickname: `Autumn Price (${price.name})`,
  });

  config.stripe_price_id = stripePrice.id;
  config.stripe_product_id = stripePrice.product as string;
  config.stripe_meter_id = meter!.id;
  await PriceService.update({
    sb,
    priceId: price.id!,
    update: { config },
  });
};
