import {
  Entitlement,
  ErrCode,
  Feature,
  Price,
  Product,
  ProductItem,
} from "@autumn/shared";
import { itemToPriceAndEnt } from "./mapFromItem.js";
import RecaseError from "@/utils/errorUtils.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { EntitlementService } from "../entitlements/EntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { pricesAreSame } from "@/internal/prices/priceUtils.js";
import { generateId } from "@/utils/genUtils.js";

const isNewItem = (item: ProductItem) => {
  return !item.entitlement_id && !item.price_id;
};

const updateDbPricesAndEnts = async ({
  sb,
  newPrices,
  newEnts,
  updatedPrices,
  updatedEnts,
  deletedPrices,
  deletedEnts,
}: {
  sb: SupabaseClient;
  newPrices: Price[];
  newEnts: Entitlement[];
  updatedPrices: Price[];
  updatedEnts: Entitlement[];
  deletedPrices: Price[];
  deletedEnts: Entitlement[];
}) => {
  // 1. Create new ents
  await Promise.all([
    EntitlementService.insert({
      sb,
      data: newEnts,
    }),
    EntitlementService.upsert({
      sb,
      data: updatedEnts,
    }),
  ]);

  // 2. Create new prices
  await Promise.all([
    PriceService.insert({
      sb,
      data: newPrices,
    }),
    PriceService.upsert({
      sb,
      data: updatedPrices,
    }),
    PriceService.deleteByIds({
      sb,
      priceIds: deletedPrices.map((price) => price.id!),
    }),
  ]);

  await EntitlementService.deleteByIds({
    sb,
    entitlementIds: deletedEnts.map((ent) => ent.id!),
  });
};

const handleCustomProductItems = async ({
  sb,
  newPrices,
  newEnts,
  updatedPrices,
  updatedEnts,
  samePrices,
  sameEnts,
  features,
}: {
  sb: SupabaseClient;
  newPrices: Price[];
  newEnts: Entitlement[];
  updatedPrices: Price[];
  updatedEnts: Entitlement[];
  samePrices: Price[];
  sameEnts: Entitlement[];
  features: Feature[];
}) => {
  await EntitlementService.insert({
    sb,
    data: [...newEnts, ...updatedEnts],
  });

  await PriceService.insert({
    sb,
    data: [...newPrices, ...updatedPrices],
  });

  return {
    prices: [...newPrices, ...updatedPrices, ...samePrices],
    entitlements: [...newEnts, ...updatedEnts, ...sameEnts].map((ent) => ({
      ...ent,
      feature: features.find((f) => f.id == ent.feature_id),
    })),
  };
};

export const handleNewProductItems = async ({
  sb,
  curPrices,
  curEnts,
  newItems,
  features,
  product,
  logger,
  isCustom,
}: {
  sb: SupabaseClient;
  curPrices: Price[];
  curEnts: Entitlement[];
  newItems: ProductItem[];
  features: Feature[];
  product: Product;
  logger: any;
  isCustom: boolean;
}) => {
  if (!newItems) {
    return {
      prices: [],
      entitlements: [],
    };
  }

  let newPrices: Price[] = [];
  let newEnts: Entitlement[] = [];

  let updatedPrices: Price[] = [];
  let updatedEnts: Entitlement[] = [];

  let deletedPrices: Price[] = curPrices.filter(
    (price) => !newItems.some((item) => item.price_id == price.id)
  );
  let deletedEnts: Entitlement[] = curEnts.filter(
    (ent) => !newItems.some((item) => item.entitlement_id == ent.id)
  );

  let samePrices: Price[] = [];
  let sameEnts: Entitlement[] = [];

  for (const item of newItems) {
    let feature = features.find((f) => f.id == item.feature_id);
    let curEnt = curEnts.find((ent) => ent.id == item.entitlement_id);
    let curPrice = curPrices.find((price) => price.id == item.price_id);

    // 2. Update price and entitlement?
    let { newPrice, newEnt, updatedPrice, updatedEnt, samePrice, sameEnt } =
      itemToPriceAndEnt({
        item,
        orgId: product.org_id!,
        internalProductId: product.internal_id!,
        feature: feature,
        curPrice,
        curEnt,
        isCustom,
      });

    if (newPrice) {
      newPrices.push(newPrice);
    }

    if (newEnt) {
      newEnts.push(newEnt);
    }

    if (updatedPrice) {
      updatedPrices.push(updatedPrice);
    }

    if (updatedEnt) {
      updatedEnts.push(updatedEnt);
    }

    if (samePrice) {
      samePrices.push(samePrice);
    }

    if (sameEnt) {
      sameEnts.push(sameEnt);
    }
  }

  // console.log("newPrices", newPrices);
  // console.log("updatedPrices", updatedPrices);
  // console.log("deletedPrices", deletedPrices);
  // console.log("samePrices", samePrices);

  // console.log("newEnts", newEnts);
  // console.log("updatedEnts", updatedEnts);
  // console.log("deletedEnts", deletedEnts);
  // console.log("sameEnts", sameEnts);

  logger.info(
    `Prices: new(${newPrices.length}), updated(${updatedPrices.length}), deleted(${deletedPrices.length})`
  );

  logger.info(
    `Ents: new(${newEnts.length}), updated(${updatedEnts.length}), deleted(${deletedEnts.length})`
  );

  if (isCustom) {
    return handleCustomProductItems({
      sb,
      newPrices,
      newEnts,
      updatedPrices,
      updatedEnts,
      samePrices,
      sameEnts,
      features,
    });
  }

  await updateDbPricesAndEnts({
    sb,
    newPrices,
    newEnts,
    updatedPrices,
    updatedEnts,
    deletedPrices,
    deletedEnts,
  });

  return {
    prices: [...newPrices, ...updatedPrices],
    entitlements: [...newEnts, ...updatedEnts].map((ent) => ({
      ...ent,
      feature: features.find((f) => f.id == ent.feature_id),
    })),
  };
};
