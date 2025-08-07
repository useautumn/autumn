import {
  AppEnv,
  Entitlement,
  Feature,
  Price,
  Product,
  ProductItem,
} from "@autumn/shared";
import { itemToPriceAndEnt } from "./itemToPriceAndEnt.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { EntitlementService } from "../../entitlements/EntitlementService.js";
import { validateProductItems } from "../validateProductItems.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { isFeatureItem } from "./getItemType.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

const updateDbPricesAndEnts = async ({
  db,
  newPrices,
  newEnts,
  updatedPrices,
  updatedEnts,
  deletedPrices,
  deletedEnts,
}: {
  db: DrizzleCli;
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
      db,
      data: newEnts,
    }),
    EntitlementService.upsert({
      db,
      data: updatedEnts,
    }),
  ]);

  // 2. Create new prices
  await Promise.all([
    PriceService.insert({
      db,
      data: newPrices,
    }),
    PriceService.upsert({
      db,
      data: updatedPrices,
    }),
    PriceService.deleteInIds({
      db,
      ids: deletedPrices.map((price) => price.id!),
    }),
  ]);

  // Check if any custom prices use this entitlement...
  let deletedEntIds = deletedEnts.map((ent) => ent.id!);
  let customPrices = await PriceService.getCustomInEntIds({
    db,
    entitlementIds: deletedEntIds,
  });

  if (customPrices.length == 0) {
    // Update the entitlement to be custom...
    await EntitlementService.deleteInIds({
      db,
      ids: deletedEntIds,
    });
  } else {
    let updateOrDelete: any = [];
    for (const ent of deletedEnts) {
      let hasCustomPrice = customPrices.some(
        (price) => price.entitlement_id == ent.id
      );

      if (hasCustomPrice) {
        updateOrDelete.push(
          EntitlementService.update({
            db,
            id: ent.id!,
            updates: {
              is_custom: true,
            },
          })
        );
      } else {
        updateOrDelete.push(
          EntitlementService.deleteInIds({
            db,
            ids: [ent.id!],
          })
        );
      }
    }

    await Promise.all(updateOrDelete);
  }
};

const handleCustomProductItems = async ({
  db,
  newPrices,
  newEnts,
  updatedPrices,
  updatedEnts,
  samePrices,
  sameEnts,
  features,
}: {
  db: DrizzleCli;
  newPrices: Price[];
  newEnts: Entitlement[];
  updatedPrices: Price[];
  updatedEnts: Entitlement[];
  samePrices: Price[];
  sameEnts: Entitlement[];
  features: Feature[];
}) => {
  // await EntitlementService.insert({
  //   db,
  //   data: [...newEnts, ...updatedEnts],
  // });

  // await PriceService.insert({
  //   db,
  //   data: [...newPrices, ...updatedPrices],
  // });

  return {
    prices: [...newPrices, ...updatedPrices, ...samePrices],
    entitlements: [...newEnts, ...updatedEnts, ...sameEnts].map((ent) => ({
      ...ent,
      feature: features.find((f) => f.id == ent.feature_id),
    })),
    customPrices: [...newPrices, ...updatedPrices],
    customEnts: [...newEnts, ...updatedEnts],
  };
};

export const handleNewProductItems = async ({
  db,
  curPrices,
  curEnts,
  newItems,
  features,
  product,
  logger,
  isCustom,
  newVersion,
  saveToDb = true,
}: {
  db: DrizzleCli;
  curPrices: Price[];
  curEnts: Entitlement[];
  newItems: ProductItem[];
  features: Feature[];
  product: Product;
  logger: any;
  isCustom: boolean;
  newVersion?: boolean;
  saveToDb?: boolean;
}) => {
  // Create features if not exist...
  if (!newItems) {
    return {
      prices: [],
      entitlements: [],
      customPrices: [],
      customEnts: [],
    };
  }

  // Validate product items...
  let { allFeatures, newFeatures } = validateProductItems({
    newItems,
    features,
    orgId: product.org_id!,
    env: product.env as AppEnv,
  });

  features = allFeatures;

  let newPrices: Price[] = [];
  let newEnts: Entitlement[] = [];

  let updatedPrices: Price[] = [];
  let updatedEnts: Entitlement[] = [];

  let deletedPrices: Price[] = curPrices.filter((price) => {
    let item = newItems.find((item) => item.price_id == price.id);
    if (!item) {
      return true;
    }

    return isFeatureItem(item);
  });

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
        newVersion,
        features,
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

  console.log("updatedEnts", updatedEnts);

  if (newFeatures.length > 0 && saveToDb) {
    await FeatureService.insert({
      db,
      data: newFeatures,
      logger,
    });
  }

  if ((isCustom || newVersion) && saveToDb) {
    return handleCustomProductItems({
      db,
      newPrices,
      newEnts,
      updatedPrices,
      updatedEnts,
      samePrices,
      sameEnts,
      features,
    });
  }

  if (saveToDb) {
    await updateDbPricesAndEnts({
      db,
      newPrices,
      newEnts,
      updatedPrices,
      updatedEnts,
      deletedPrices,
      deletedEnts,
    });
  }

  return {
    prices: [...newPrices, ...updatedPrices],
    entitlements: [...newEnts, ...updatedEnts].map((ent) => ({
      ...ent,
      feature: features.find((f) => f.id == ent.feature_id),
    })),
    customPrices: [],
    customEnts: [],
  };
};
