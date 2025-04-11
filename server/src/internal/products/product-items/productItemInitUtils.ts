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
  console.log("Deleting prices", deletedPrices);
  console.log("Deleting ents", deletedEnts);

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

export const handleNewProductItems = async ({
  sb,
  curPrices,
  curEnts,
  newItems,
  features,
  product,
  logger,
}: {
  sb: SupabaseClient;
  curPrices: Price[];
  curEnts: Entitlement[];
  newItems: ProductItem[];
  features: Feature[];
  product: Product;
  logger: any;
}) => {
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

  for (const item of newItems) {
    let feature = features.find((f) => f.id == item.feature_id);
    let curEnt = curEnts.find((ent) => ent.id == item.entitlement_id);
    let curPrice = curPrices.find((price) => price.id == item.price_id);

    // 2. Update price and entitlement?
    let { newPrice, newEnt, updatedPrice, updatedEnt } = itemToPriceAndEnt({
      item,
      orgId: product.org_id!,
      internalProductId: product.internal_id!,
      isCustom: false,
      feature: feature,
      curPrice,
      curEnt,
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

  logger.info(
    `Prices: new(${newPrices.length}), updated(${updatedPrices.length}), deleted(${deletedPrices.length})`
  );

  logger.info(
    `Ents: new(${newEnts.length}), updated(${updatedEnts.length}), deleted(${deletedEnts.length})`
  );

  return { newPrices, newEnts };
};
