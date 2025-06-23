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
} from "@autumn/shared";
import { priceToStripeItem } from "../priceToStripeItem/priceToStripeItem.js";
import { getArrearItems } from "./getStripeSubItems/getArrearItems.js";
import {
  compareBillingIntervals,
  sortPricesByInterval,
} from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { isUsagePrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

const getIntervalToPrices = (prices: Price[]) => {
  const intervalToPrices: Record<string, Price[]> = {};

  for (const price of prices) {
    const interval = price.config.interval;
    if (!intervalToPrices[interval]) {
      intervalToPrices[interval] = [];
    }
    intervalToPrices[interval].push(price);
  }

  let oneOffPrices =
    intervalToPrices[BillingInterval.OneOff] &&
    intervalToPrices[BillingInterval.OneOff].length > 0;

  // If there are multiple intervals, add one off prices to first interval
  if (oneOffPrices && Object.keys(intervalToPrices).length > 1) {
    const nextIntervalKey = Object.keys(intervalToPrices)[0];
    intervalToPrices[nextIntervalKey!].push(
      ...structuredClone(intervalToPrices[BillingInterval.OneOff]),
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

  for (const interval in intervalToPrices) {
    const prices = intervalToPrices[interval];

    let subItems: any[] = [];

    let usage_features: any[] = [];

    for (const price of prices) {
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
      });

      if (!stripeItem) {
        continue;
      }

      const { lineItem } = stripeItem;

      subItems.push(lineItem);
    }

    if (subItems.length == 0) {
      subItems.push(
        ...getArrearItems({
          prices,
          org,
          interval: interval as BillingInterval,
        }),
      );
    }

    itemSets.push({
      items: subItems,
      interval,
      subMeta: {
        usage_features: JSON.stringify(usage_features),
      },
      usageFeatures: usage_features.map((f) => f.internal_id) || [],
      prices,
    });
  }

  itemSets.sort((a, b) => compareBillingIntervals(a.interval, b.interval));

  return itemSets;
};
