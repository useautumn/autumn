import {
  AppEnv,
  Entitlement,
  Feature,
  Price,
  Product,
  ProductItem,
} from "@autumn/shared";
import { itemToPriceAndEnt } from "./mapFromItem.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { EntitlementService } from "../entitlements/EntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { validateProductItems } from "./validateProductItems.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { isFeatureItem } from "./getItemType.js";

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

  // Check if any custom prices use this entitlement...
  let deletedEntIds = deletedEnts.map((ent) => ent.id!);
  let customPrices = await PriceService.getInIds({
    sb,
    entitlementIds: deletedEntIds,
  });

  if (customPrices.length == 0) {
    // Update the entitlement to be custom...
    await EntitlementService.deleteByIds({
      sb,
      entitlementIds: deletedEntIds,
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
            sb,
            entitlementId: ent.id!,
            updates: {
              is_custom: true,
            },
          })
        );
      } else {
        updateOrDelete.push(
          EntitlementService.deleteByIds({
            sb,
            entitlementIds: [ent.id!],
          })
        );
      }
    }

    await Promise.all(updateOrDelete);
  }
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
  newVersion,
}: {
  sb: SupabaseClient;
  curPrices: Price[];
  curEnts: Entitlement[];
  newItems: ProductItem[];
  features: Feature[];
  product: Product;
  logger: any;
  isCustom: boolean;
  newVersion?: boolean;
}) => {
  // Create features if not exist...

  if (!newItems) {
    return {
      prices: [],
      entitlements: [],
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

  if (newFeatures.length > 0) {
    await FeatureService.insert({
      sb,
      data: newFeatures,
    });
  }

  if (isCustom || newVersion) {
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
