import {
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  PriceOptions,
  Organization,
  FullProduct,
  Price,
  UsagePriceConfig,
  FeatureOptions,
  Entitlement,
  Feature,
  Product,
  AllowanceType,
  EntitlementWithFeature,
} from "@autumn/shared";

import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import Stripe from "stripe";
import {
  getBillingType,
  getPriceAmount,
  getPriceEntitlement,
  getPriceOptions,
} from "@/internal/prices/priceUtils.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
export const billingIntervalToStripe = (interval: BillingInterval) => {
  switch (interval) {
    case BillingInterval.Month:
      return {
        interval: "month",
        interval_count: 1,
      };
    case BillingInterval.Quarter:
      return {
        interval: "month",
        interval_count: 3,
      };
    case BillingInterval.SemiAnnual:
      return {
        interval: "month",
        interval_count: 6,
      };
    case BillingInterval.Year:
      return {
        interval: "year",
        interval_count: 1,
      };
    default:
      break;
  }
};

export const priceToStripeItem = ({
  price,
  product,
  org,
  options,
  isCheckout = false,
  relatedEnt,
}: {
  price: Price;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
  relatedEnt: EntitlementWithFeature | undefined;
}) => {
  // TODO: Implement this
  const billingType = price.billing_type;
  const stripeProductId = product.processor?.id;

  if (!stripeProductId) {
    throw new RecaseError({
      code: ErrCode.ProductNotFound,
      message: "Product not created in Stripe",
      statusCode: 400,
    });
  }

  let lineItemMeta = null;
  let lineItem = null;
  if (billingType == BillingType.OneOff) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: Math.round(config.amount * 100),
        currency: org.default_currency,
      },
    };
  } else if (billingType == BillingType.FixedCycle) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: Math.round(config.amount * 100),
        currency: org.default_currency,
        recurring: billingIntervalToStripe(config.interval as BillingInterval),
      },
    };
  } else if (billingType == BillingType.UsageInAdvance) {
    const config = price.config as UsagePriceConfig;
    const quantity = options?.quantity || 1;

    const adjustableQuantity = isCheckout
      ? {
          enabled: true,
        }
      : undefined;

    if (!config.stripe_price_id) {
      throw new RecaseError({
        code: ErrCode.PriceNotFound,
        message: `Price ${price.id} has no Stripe price id`,
        statusCode: 400,
      });
    }

    lineItem = {
      price: config.stripe_price_id,
      quantity,
      adjustable_quantity: adjustableQuantity,
    };
    lineItemMeta = {
      internal_feature_id: config.internal_feature_id,
      feature_id: config.feature_id,
      price_id: price.id,
    };
  } else if (billingType == BillingType.UsageInArrear) {
    // TODO: Implement this
    const config = price.config as UsagePriceConfig;
    const priceId = config.stripe_price_id;

    if (!priceId) {
      throw new RecaseError({
        code: ErrCode.PriceNotFound,
        message: `Couldn't find price: ${price.name}, ${price.id} in Stripe`,
        statusCode: 400,
      });
    }

    lineItem = {
      price: priceId,
    };
  }

  return {
    lineItem,
    lineItemMeta,
  };
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
      unit_amount_decimal: amount.toFixed(5),
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

  if (
    config.usage_tiers.length == 1 &&
    price.config!.interval == BillingInterval.OneOff
  ) {
    const amount = config.usage_tiers[0].amount;
    stripePrice = await stripeCli.prices.create({
      product_data: {
        name: productName,
      },
      unit_amount: Math.round(amount * 100),
      currency: org.default_currency,
    });
  } else {
    stripePrice = await stripeCli.prices.create({
      product_data: {
        name: productName,
      },
      currency: org.default_currency,
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: inAdvanceToStripeTiers(price, relatedEnt),
      recurring: {
        ...(recurringData as any),
      },
    });
  }

  config.stripe_price_id = stripePrice.id;

  // New config
  price.config = config;
  await PriceService.update({
    sb,
    priceId: price.id!,
    update: { config },
  });
};

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
    const amount = (tier.amount / (usageConfig.billing_units ?? 1)) * 100;

    tiers.push({
      unit_amount_decimal: amount.toFixed(5),
      up_to: tier.to == -1 ? "inf" : tier.to,
    });
  }

  return tiers;
};

export const createStripeMeteredPrice = async ({
  stripeCli,
  meterId,
  product,
  price,
  entitlements,
  feature,
}: {
  stripeCli: Stripe;
  meterId: string;
  product: Product;
  price: Price;
  entitlements: Entitlement[];
  feature: Feature;
}) => {
  const relatedEntitlement = entitlements.find(
    (e) => e.internal_feature_id === feature!.internal_id
  );

  const isOverage =
    relatedEntitlement?.allowance_type == AllowanceType.Fixed &&
    relatedEntitlement.allowance &&
    relatedEntitlement.allowance > 0;

  let overageStr = "";
  // if (isOverage) {
  //   overageStr = ` (overage)`;
  // }

  const tiers = priceToStripeTiers(
    price,
    entitlements.find((e) => e.internal_feature_id === feature!.internal_id)!
  );

  let priceAmountData = {};

  if (tiers.length == 1) {
    priceAmountData = {
      unit_amount: tiers[0].unit_amount,
    };
  } else {
    priceAmountData = {
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: tiers,
    };
  }

  return await stripeCli.prices.create({
    // product: product.processor!.id,
    product_data: {
      name: `${product.name} - ${feature!.name}${overageStr}`,
    },

    ...priceAmountData,
    currency: "usd",
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meterId,
      usage_type: "metered",
    },
  });
};

export const createStripeInArrearPrice = async ({
  sb,
  stripeCli,
  product,
  price,
  entitlements,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  product: Product;
  price: Price;
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
  priceAmountData = {
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    tiers: tiers,
  };

  const stripePrice = await stripeCli.prices.create({
    // product: product.processor!.id,
    product_data: {
      name: `${product.name} - ${feature!.name}`,
    },

    ...priceAmountData,
    currency: "usd",
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meter!.id,
      usage_type: "metered",
    },
  });

  config.stripe_price_id = stripePrice.id;
  config.stripe_meter_id = meter!.id;
  await PriceService.update({
    sb,
    priceId: price.id!,
    update: { config },
  });
};

export const createStripePriceIFNotExist = async ({
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
  const billingType = getBillingType(price.config!);
  let config = price.config! as UsagePriceConfig;

  try {
    if (config.stripe_price_id) {
      const stripePrice = await stripeCli.prices.retrieve(
        config.stripe_price_id
      );

      if (!stripePrice.active) {
        throw new Error("inactive price");
      }
    }
  } catch (error) {
    console.log("Stripe price not found / inactive");
    config.stripe_price_id = undefined;
    config.stripe_meter_id = undefined;
  }

  if (billingType == BillingType.UsageInAdvance) {
    if (!config.stripe_price_id) {
      console.log("Creating stripe price for in advance price");
      await createStripeInAdvancePrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      });
    }
  } else if (billingType == BillingType.UsageInArrear) {
    if (!config.stripe_price_id) {
      console.log("Creating stripe price for in arrear price");
      await createStripeInArrearPrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
      });
    }
  }
};

export const pricesToInvoiceItems = async ({
  sb,
  stripeCli,
  attachParams,
  stripeInvoiceId,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  attachParams: AttachParams;
  stripeInvoiceId: string;
}) => {
  const { prices, optionsList, entitlements, product, customer } = attachParams;
  for (const price of prices) {
    // Calculate amount
    const options = getPriceOptions(price, optionsList);
    const entitlement = getPriceEntitlement(price, entitlements);
    const { amountPerUnit, quantity } = getPriceAmount(price, options!);

    let allowanceStr = "";
    if (entitlement) {
      allowanceStr =
        entitlement.allowance_type == AllowanceType.Unlimited
          ? "Unlimited"
          : entitlement.allowance_type == AllowanceType.None
          ? "None"
          : `${entitlement.allowance}`;
      allowanceStr = `x ${allowanceStr} (${entitlement.feature.name})`;
    }

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amountPerUnit * quantity * 100,
      invoice: stripeInvoiceId,
      description: `Invoice for ${product.name} -- ${quantity}${allowanceStr}`,
    });
  }
};
