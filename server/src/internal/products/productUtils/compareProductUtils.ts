import {
  ErrCode,
  Feature,
  FullProduct,
  ProductItem,
  ProductV2,
} from "@autumn/shared";
import { mapToProductItems } from "../productV2Utils.js";
import {
  findSimilarItem,
  itemsAreSame,
} from "../product-items/compareItemUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { freeTrialsAreSame } from "../free-trials/freeTrialUtils.js";
import {
  isFeaturePriceItem,
  isPriceItem,
} from "../product-items/productItemUtils/getItemType.js";

export const productsAreSame = ({
  newProductV1,
  newProductV2,
  curProductV1,
  curProductV2,
  features,
}: {
  newProductV1?: FullProduct;
  newProductV2?: ProductV2;
  curProductV1?: FullProduct;
  curProductV2?: ProductV2;
  features: Feature[];
}) => {
  if (!newProductV1 && !newProductV2) {
    throw new RecaseError({
      message: "productsAreSame error: product1 not provided",
      code: ErrCode.InvalidRequest,
    });
  }

  if (!curProductV1 && !curProductV2) {
    throw new RecaseError({
      message: "productsAreSame error: product2 not provided",
      code: ErrCode.InvalidRequest,
    });
  }

  let items1 =
    newProductV2?.items ||
    mapToProductItems({
      prices: newProductV1?.prices || [],
      entitlements: newProductV1?.entitlements || [],
      features,
    });

  let items2 =
    curProductV2?.items ||
    mapToProductItems({
      prices: curProductV1?.prices || [],
      entitlements: curProductV1?.entitlements || [],
      features,
    });

  let itemsSame = true;

  if (items1.length !== items2.length) {
    itemsSame = false;
  }

  let pricesChanged = false;

  const newItems: ProductItem[] = [];
  const removedItems: ProductItem[] = [];
  for (const item of items1) {
    let similarItem = findSimilarItem({
      item,
      items: items2,
    });

    if (!similarItem) {
      if (isFeaturePriceItem(item) || isPriceItem(item)) {
        pricesChanged = true;
      }

      itemsSame = false;
      newItems.push(item);

      continue;
    }

    const { same, pricesChanged: pricesChanged_ } = itemsAreSame({
      item1: item,
      item2: similarItem!,
      features,
    });

    if (!same) {
      itemsSame = false;
      newItems.push(item);
    }

    if (pricesChanged_) {
      pricesChanged = true;
    }
  }

  for (const item of items2) {
    let similarItem = findSimilarItem({
      item,
      items: items1,
    });

    if (!similarItem) {
      itemsSame = false;
      if (isFeaturePriceItem(item) || isPriceItem(item)) {
        pricesChanged = true;
      }

      removedItems.push(item);
    }
  }

  // Compare free trial
  let freeTrial1 = curProductV1?.free_trial || curProductV2?.free_trial;
  let freeTrial2 = newProductV1?.free_trial || newProductV2?.free_trial;

  let freeTrialsSame = freeTrialsAreSame({
    ft1: freeTrial1,
    ft2: freeTrial2,
  });

  // Compare name
  return {
    itemsSame,
    freeTrialsSame,
    onlyEntsChanged: !pricesChanged,
    newItems,
    removedItems,
  };
};
