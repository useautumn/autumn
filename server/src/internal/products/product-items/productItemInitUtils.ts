import {
  EntInterval,
  Entitlement,
  ErrCode,
  Feature,
  Price,
  Product,
  ProductItem,
  ProductItemBehavior,
} from "@autumn/shared";
import { itemToPriceAndEnt } from "./mapFromItem.js";
import RecaseError from "@/utils/errorUtils.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { EntitlementService } from "../entitlements/EntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { pricesAreSame } from "@/internal/prices/priceUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { StatusCodes } from "http-status-codes";
import {
  isFeaturePriceItem,
  itemIsFree,
  itemToEntInterval,
} from "./productItemUtils.js";

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

const validateProductItems = ({ newItems }: { newItems: ProductItem[] }) => {
  for (let index = 0; index < newItems.length; index++) {
    let item = newItems[index];
    let entInterval = itemToEntInterval(item);

    if (isFeaturePriceItem(item) && entInterval == EntInterval.Lifetime) {
      let otherItem = newItems.find((i: any, index2: any) => {
        return i.feature_id == item.feature_id && index2 != index;
      });

      if (otherItem) {
        throw new RecaseError({
          message: `If feature is lifetime and paid, can't have any other features`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }

    let otherItem = newItems.find((i: any, index2: any) => {
      return (
        i.feature_id == item.feature_id &&
        index2 != index &&
        itemToEntInterval(i) == entInterval
      );
    });

    // console.log("Item", item);
    // console.log("Ent interval", entInterval);
    // console.log("Other item exists", notNullish(otherItem));

    if (!otherItem) {
      continue;
    }

    if (itemIsFree(otherItem) || item.behavior == otherItem?.behavior) {
      throw new RecaseError({
        message: `Can't have two features with same reset interval, unless one is prepaid, and another is pay per use`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }
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

  // Validate product items...
  validateProductItems({
    newItems,
  });

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
