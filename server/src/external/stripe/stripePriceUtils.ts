import {
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  Organization,
  FullProduct,
  Price,
  UsagePriceConfig,
  FeatureOptions,
  Product,
  AllowanceType,
  EntitlementWithFeature,
  Feature,
  FullCustomerEntitlement,
} from "@autumn/shared";

import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import Stripe from "stripe";
import {
  compareBillingIntervals,
  getBillingType,
  getCheckoutRelevantPrices,
  getEntOptions,
  getPriceAmount,
  getPriceEntitlement,
  getPriceForOverage,
  getPriceOptions,
  getProductForPrice,
  priceIsOneOffAndTiered,
} from "@/internal/prices/priceUtils.js";

import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";

import {
  createStripeFixedCyclePrice,
  createStripeInAdvancePrice,
  createStripeInArrearPrice,
  createStripeOneOffTieredProduct,
} from "./createStripePrice.js";

import {
  getCusEntMasterBalance,
  getExistingUsageFromCusProducts,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import {
  priceToInArrearProrated,
  priceToUsageInAdvance,
} from "./priceToStripeItem.js";
import {
  entitlementLinkedToEntity,
  entityMatchesFeature,
} from "@/internal/api/entities/entityUtils.js";
import { getExistingCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";

export const createSubMeta = ({ features }: { features: Feature[] }) => {
  const usageFeatures = features.map((f) => ({
    internal_id: f.internal_id,
    id: f.id,
  }));
  return { usage_features: JSON.stringify(usageFeatures) };
};

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

// GET STRIPE LINE / SUB ITEM
export const priceToStripeItem = ({
  price,
  relatedEnt,
  product,
  org,
  options,
  isCheckout = false,
  existingUsage,
}: {
  price: Price;
  relatedEnt: EntitlementWithFeature;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
  existingUsage: number;
}) => {
  // TODO: Implement this
  const billingType = getBillingType(price.config!);
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
  // if (billingType == BillingType.OneOff) {
  //   const config = price.config as FixedPriceConfig;

  //   lineItem = {
  //     quantity: 1,
  //     price_data: {
  //       product: stripeProductId,
  //       unit_amount: Math.round(config.amount * 100),
  //       currency: org.default_currency,
  //     },
  //   };
  // } else

  if (
    billingType == BillingType.FixedCycle ||
    billingType == BillingType.OneOff
  ) {
    const config = price.config as FixedPriceConfig;
    lineItem = {
      price: config.stripe_price_id,
      quantity: 1,
    };
    // lineItem = {
    //   quantity: 1,
    //   price_data: {
    //     product: stripeProductId,
    //     unit_amount: Math.round(config.amount * 100),
    //     currency: org.default_currency,
    //     recurring: billingIntervalToStripe(config.interval as BillingInterval),
    //   },
    // };
  } else if (
    billingType == BillingType.UsageInAdvance &&
    priceIsOneOffAndTiered(price, relatedEnt)
  ) {
    const config = price.config as UsagePriceConfig;
    let quantity = options?.quantity!;
    let overage = quantity * config.billing_units! - relatedEnt.allowance!;

    if (overage <= 0) {
      return null;
    }

    const amount = getPriceForOverage(price, overage);
    if (!config.stripe_product_id) {
      console.log(
        `WARNING: One off & tiered in advance price has no stripe product id: ${price.id}, ${relatedEnt.feature.name}`
      );
    }
    lineItem = {
      price_data: {
        product: config.stripe_product_id
          ? config.stripe_product_id
          : stripeProductId,
        unit_amount: Number(amount.toFixed(2)) * 100,
        currency: org.default_currency,
      },
      // quantity: overage,
      quantity: 1,
    };
  } else if (billingType == BillingType.UsageInAdvance) {
    lineItem = priceToUsageInAdvance({
      price,
      options,
      isCheckout,
      relatedEnt,
    });
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
  } else if (billingType == BillingType.InArrearProrated) {
    lineItem = priceToInArrearProrated({
      price,
      isCheckout,
      existingUsage,
    });
  }

  if (!lineItem) {
    return null;
  }

  return {
    lineItem,
    lineItemMeta,
  };
};

// STRIPE TO SUB ITEMS
export const getStripeSubItems = async ({
  attachParams,
  isCheckout = false,
  carryExistingUsages = false,
}: {
  attachParams: AttachParams;
  isCheckout?: boolean;
  carryExistingUsages?: boolean;
}) => {
  const { products, prices, entitlements, optionsList, org, cusProducts } =
    attachParams;

  prices.sort((a, b) => {
    // Put year prices first
    return -compareBillingIntervals(a.config!.interval!, b.config!.interval!);
  });

  // First do interval to prices
  const intervalToPrices: Record<string, Price[]> = {};

  for (const price of prices) {
    if (!intervalToPrices[price.config!.interval!]) {
      intervalToPrices[price.config!.interval!] = [];
    }
    intervalToPrices[price.config!.interval!].push(price);
  }

  let oneOffPrices =
    intervalToPrices[BillingInterval.OneOff] &&
    intervalToPrices[BillingInterval.OneOff].length > 0;

  // If there are multiple intervals, add one off prices to the top interval
  if (oneOffPrices && Object.keys(intervalToPrices).length > 1) {
    const nextIntervalKey = Object.keys(intervalToPrices)[0];
    intervalToPrices[nextIntervalKey!].push(
      ...structuredClone(intervalToPrices[BillingInterval.OneOff])
    );
    delete intervalToPrices[BillingInterval.OneOff];
  }

  const itemSets: any[] = [];

  for (const interval in intervalToPrices) {
    // Get prices for this interval
    const prices = intervalToPrices[interval];

    let subItems: any[] = [];
    let itemMetas: any[] = [];

    let usage_features: any[] = [];

    for (const price of prices) {
      const priceEnt = getPriceEntitlement(price, entitlements);
      const options = getEntOptions(optionsList, priceEnt);
      const billingType = getBillingType(price.config!);
      let existingUsage = getExistingUsageFromCusProducts({
        entitlement: priceEnt,
        cusProducts: attachParams.cusProducts,
        entities: attachParams.entities,
        carryExistingUsages,
      });

      if (
        billingType == BillingType.UsageInArrear ||
        billingType == BillingType.InArrearProrated ||
        billingType == BillingType.UsageInAdvance
      ) {
        usage_features.push({
          internal_id: priceEnt.feature.internal_id,
          id: priceEnt.feature.id,
        });
      }

      let product = getProductForPrice(price, products)!;

      const stripeItem = priceToStripeItem({
        price,
        product,
        org,
        options,
        isCheckout,
        relatedEnt: priceEnt,
        existingUsage,
      });

      if (!stripeItem) {
        continue;
      }

      const { lineItem, lineItemMeta } = stripeItem;

      subItems.push(lineItem);
      itemMetas.push(lineItemMeta);
    }

    itemSets.push({
      items: subItems,
      itemMetas,
      interval,
      subMeta: {
        usage_features: JSON.stringify(usage_features),
      },
      usageFeatures: usage_features.map((f) => f.internal_id) || [],
      prices,
    });
  }

  itemSets.sort((a, b) => {
    let order = [
      BillingInterval.Year,
      BillingInterval.SemiAnnual,
      BillingInterval.Quarter,
      BillingInterval.Month,
      BillingInterval.OneOff,
    ];
    return order.indexOf(a.interval) - order.indexOf(b.interval);
  });

  // console.log("Prices:", prices);
  // console.log("Item sets", itemSets[0].items);

  return itemSets;
};

const getProductIdFromPrice = async ({
  stripeCli,
  price,
}: {
  stripeCli: Stripe;
  price: Price;
}) => {
  const config = price.config as UsagePriceConfig;
  if (!config.stripe_product_id) {
    return null;
  }

  try {
    const stripeProduct = await stripeCli.products.retrieve(
      config.stripe_product_id!
    );
    if (!stripeProduct.active) {
      return null;
    }
    return config.stripe_product_id;
  } catch (error) {
    return null;
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
  const { prices, optionsList, entitlements, products, customer } =
    attachParams;
  for (const price of prices) {
    // Calculate amount
    const options = getPriceOptions(price, optionsList);
    const entitlement = getPriceEntitlement(price, entitlements);
    const amount = getPriceAmount({
      price,
      options,
      relatedEnt: entitlement,
    });

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

    let product = getProductForPrice(price, products)!;

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amount * 100,
      invoice: stripeInvoiceId,
      description: `${product.name}${allowanceStr}`,
    });
  }
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

  let config = price.config! as UsagePriceConfig;

  try {
    if (config.stripe_price_id) {
      // Check stripe price and product
      const stripePrice = await stripeCli.prices.retrieve(
        config.stripe_price_id
      );

      const stripePriceProduct = await stripeCli.products.retrieve(
        stripePrice.product as string
      );

      if (!stripePrice.active || !stripePriceProduct.active) {
        config.stripe_price_id = undefined;
        config.stripe_meter_id = undefined;
      }

      // Check stripe product
      if (config.stripe_product_id) {
        let stripeProduct;
        if (stripePriceProduct.id != config.stripe_product_id) {
          stripeProduct = stripePriceProduct;
        } else {
          stripeProduct = await stripeCli.products.retrieve(
            config.stripe_product_id as string
          );
        }

        if (!stripeProduct.active) {
          config.stripe_product_id = null;
        }
      }
    }
  } catch (error: any) {
    logger.info("Stripe price not found / inactive, creating new");
    config.stripe_price_id = undefined;
    config.stripe_meter_id = undefined;
    config.stripe_product_id = undefined;
  }

  if (
    billingType == BillingType.FixedCycle ||
    billingType == BillingType.OneOff
  ) {
    if (!config.stripe_price_id) {
      logger.info("Creating stripe fixed cycle price");
      await createStripeFixedCyclePrice({
        sb,
        stripeCli,
        price,
        product,
        org,
      });
    }
  } else if (billingType == BillingType.UsageInAdvance) {
    // If tiered and one off
    let relatedEnt = getPriceEntitlement(price, entitlements);
    let isOneOffAndTiered = priceIsOneOffAndTiered(price, relatedEnt);

    if (isOneOffAndTiered) {
      // Check if product_id doesn't exist -- create
      let productId = await getProductIdFromPrice({
        stripeCli,
        price,
      });

      if (!productId) {
        logger.info(
          "Creating stripe product for in advance price, one off & tiered"
        );
        await createStripeOneOffTieredProduct({
          sb,
          stripeCli,
          price,
          entitlements,
          product,
        });
      }
    }

    // For the rest
    if (!isOneOffAndTiered && !config.stripe_price_id) {
      logger.info("Creating stripe price for in advance price");
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
      logger.info("Creating stripe price for in arrear price");
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
  } else if (billingType == BillingType.InArrearProrated) {
    if (!config.stripe_price_id) {
      logger.info("Creating stripe price for in arrear prorated price");
      await createStripeInAdvancePrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      });
    }
  }
};
