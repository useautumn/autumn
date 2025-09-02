import { getExistingUsageFromCusProducts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import {
  getPriceEntitlement,
  getEntOptions,
  getProductForPrice,
} from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import {
  FullProduct,
  Price,
  EntitlementWithFeature,
  FeatureOptions,
  Organization,
  FullCusProduct,
  BillingInterval,
  Entity,
  APIVersion,
  InsertReplaceable,
  AttachReplaceable,
  ErrCode,
  AttachConfig,
  ProductOptions,
} from "@autumn/shared";
import { priceToStripeItem } from "../priceToStripeItem/priceToStripeItem.js";
import { getArrearItems } from "./getStripeSubItems/getArrearItems.js";
import {
  compareBillingIntervals,
  sortPricesByInterval,
} from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { isUsagePrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import RecaseError from "@/utils/errorUtils.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
  intervalKeyToPrice,
  priceToIntervalKey,
  priceToProductOptions,
} from "@/internal/products/prices/priceUtils/convertPrice.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ItemSet } from "@/utils/models/ItemSet.js";

const getIntervalToPrices = (prices: Price[]) => {
  const intervalToPrices: Record<string, Price[]> = {};

  for (const price of prices) {
    // const interval = price.config.interval;
    const key = priceToIntervalKey(price);
    if (!intervalToPrices[key]) {
      intervalToPrices[key] = [];
    }
    intervalToPrices[key].push(price);
  }

  let oneOffPrices =
    intervalToPrices[BillingInterval.OneOff] &&
    intervalToPrices[BillingInterval.OneOff].length > 0;

  // If there are multiple intervals, add one off prices to first interval
  if (oneOffPrices && Object.keys(intervalToPrices).length > 1) {
    const nextIntervalKey = Object.keys(intervalToPrices)[0];
    intervalToPrices[nextIntervalKey!].push(
      ...structuredClone(intervalToPrices[BillingInterval.OneOff])
    );
    delete intervalToPrices[BillingInterval.OneOff];
  }

  return intervalToPrices;
};

export const getStripeSubItems = async ({
  attachParams,
  isCheckout = false,
  carryExistingUsages = false,
}: {
  attachParams: {
    products: FullProduct[];
    productsList?: ProductOptions[];
    prices: Price[];
    entitlements: EntitlementWithFeature[];
    optionsList: FeatureOptions[];
    org: Organization;
    internalEntityId?: string;
    cusProducts?: FullCusProduct[];
    entities: Entity[];
    apiVersion?: APIVersion;
    replaceables: AttachReplaceable[];
  };
  isCheckout?: boolean;
  carryExistingUsages?: boolean;
}) => {
  const {
    products,
    prices,
    entitlements,
    optionsList,
    org,
    internalEntityId,
    cusProducts,
    entities,
  } = attachParams;

  sortPricesByInterval(prices);

  const itemSets: any[] = [];

  const intervalToPrices = getIntervalToPrices(prices);

  for (const intervalKey in intervalToPrices) {
    const prices = intervalToPrices[intervalKey];

    let subItems: any[] = [];
    let usage_features: any[] = [];

    for (const price of prices) {
      const prodOptions = priceToProductOptions({
        price,
        options: attachParams.productsList,
        products,
      });

      const priceEnt = getPriceEntitlement(price, entitlements);
      const options = getEntOptions(optionsList, priceEnt);

      let existingUsage = getExistingUsageFromCusProducts({
        entitlement: priceEnt,
        cusProducts,
        entities,
        carryExistingUsages,
        internalEntityId,
      });

      let replaceables = priceEnt
        ? attachParams.replaceables.filter((r) => r.ent.id === priceEnt.id)
        : [];

      existingUsage += replaceables.length;

      if (isUsagePrice({ price })) {
        usage_features.push({
          internal_id: priceEnt.feature.internal_id,
          id: priceEnt.feature.id,
        });
      }

      let product = getProductForPrice(price, products)!;

      if (!product) {
        logger.error(
          `Couldn't find product for price ${price.internal_product_id}`,
          {
            data: {
              products: attachParams.products,
              price,
            },
          }
        );
        throw new RecaseError({
          code: ErrCode.ProductNotFound,
          message: `Price internal product ID: ${price.internal_product_id} not found in products`,
          statusCode: 400,
        });
      }

      const stripeItem = priceToStripeItem({
        price,
        product,
        org,
        options,
        isCheckout,
        relatedEnt: priceEnt,
        existingUsage,
        withEntity: notNullish(attachParams.internalEntityId),
        apiVersion: attachParams.apiVersion,
        productOptions: prodOptions,
      });

      if (!stripeItem) {
        continue;
      }

      const { lineItem } = stripeItem;

      subItems.push(lineItem);
    }

    const { interval, intervalCount } = intervalKeyToPrice(intervalKey);
    if (subItems.length == 0) {
      subItems.push(
        ...getArrearItems({
          prices,
          org,
          interval: interval as BillingInterval,
          intervalCount,
        })
      );
    }

    itemSets.push({
      items: subItems,
      interval,
      intervalCount,
      subMeta: {
        usage_features: JSON.stringify(usage_features),
      },
      usageFeatures: usage_features.map((f) => f.internal_id) || [],
      prices,
    });
  }

  itemSets.sort((a, b) =>
    compareBillingIntervals({
      configA: {
        interval: a.interval,
        intervalCount: a.intervalCount,
      },
      configB: {
        interval: b.interval,
        intervalCount: b.intervalCount,
      },
    })
  );

  return itemSets;
};

export const getStripeSubItems2 = async ({
  attachParams,
  config,
}: {
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const {
    prices,
    entitlements,
    optionsList,
    cusProducts,
    customer,
    internalEntityId,
    apiVersion,
    products,
  } = attachParams;

  const subItems: any[] = [];
  const invoiceItems: any[] = [];
  const usageFeatures: any[] = [];
  for (const price of prices) {
    const priceEnt = getPriceEntitlement(price, entitlements);
    const options = getEntOptions(optionsList, priceEnt);
    const prodOptions = priceToProductOptions({
      price,
      options: attachParams.productsList,
      products,
    });

    let existingUsage = getExistingUsageFromCusProducts({
      entitlement: priceEnt,
      cusProducts,
      entities: customer.entities,
      carryExistingUsages: config.carryUsage,
      internalEntityId,
    });

    let replaceables = priceEnt
      ? attachParams.replaceables.filter((r) => r.ent.id === priceEnt.id)
      : [];

    existingUsage += replaceables.length;

    let product = getProductForPrice(price, attachParams.products)!;

    if (!product) {
      logger.error(
        `Couldn't find product for price ${price.internal_product_id}`,
        {
          data: {
            products: attachParams.products,
            price,
          },
        }
      );
      throw new RecaseError({
        code: ErrCode.ProductNotFound,
        message: `Price internal product ID: ${price.internal_product_id} not found in products`,
        statusCode: 400,
      });
    }

    const stripeItem = priceToStripeItem({
      price,
      product,
      org: attachParams.org,
      options,
      isCheckout: config.onlyCheckout,
      relatedEnt: priceEnt,
      existingUsage,
      withEntity: notNullish(internalEntityId),
      apiVersion: attachParams.apiVersion,
      productOptions: prodOptions,
    });

    if (isUsagePrice({ price })) {
      usageFeatures.push(priceEnt.feature.internal_id);
    }

    if (!stripeItem) {
      continue;
    }

    const { lineItem } = stripeItem;

    // subItems.push(lineItem);

    if (price.config.interval === BillingInterval.OneOff) {
      invoiceItems.push(lineItem);
    } else {
      subItems.push({
        ...lineItem,
        autumnPrice: price,
      });
    }
  }

  return { subItems, invoiceItems, usageFeatures } as ItemSet;
};

export const sanitizeSubItems = (subItems: any[]) => {
  return subItems.map((si) => {
    const { autumnPrice, ...rest } = si;
    return {
      ...rest,
    };
  });
};
