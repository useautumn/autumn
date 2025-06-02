import {
  ErrCode,
  Feature,
  FullProduct,
  Product,
  ProductV2,
} from "@autumn/shared";
import { mapToProductItems } from "./productV2Utils.js";
import {
  findSimilarItem,
  itemsAreSame,
} from "./product-items/compareItemUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { freeTrialsAreSame } from "./free-trials/freeTrialUtils.js";
import { isFeatureItem } from "./product-items/getItemType.js";

export const productsAreSame = ({
  v1Product1,
  v1Product2,
  v2Product1,
  v2Product2,
  features,
}: {
  v1Product1?: FullProduct;
  v1Product2?: FullProduct;
  v2Product1?: ProductV2;
  v2Product2?: ProductV2;
  features: Feature[];
}) => {
  if (!v1Product1 && !v2Product1) {
    throw new RecaseError({
      message: "productsAreSame error: product1 not provided",
      code: ErrCode.InvalidRequest,
    });
  }

  if (!v1Product2 && !v2Product2) {
    throw new RecaseError({
      message: "productsAreSame error: product2 not provided",
      code: ErrCode.InvalidRequest,
    });
  }

  let items1 =
    v2Product1?.items ||
    mapToProductItems({
      prices: v1Product1?.prices || [],
      entitlements: v1Product1?.entitlements || [],
      features,
    });

  let items2 =
    v2Product2?.items ||
    mapToProductItems({
      prices: v1Product2?.prices || [],
      entitlements: v1Product2?.entitlements || [],
      features,
    });

  let itemsSame = true;
  if (items1.length !== items2.length) {
    itemsSame = false;
  }

  let priceChanged = false;

  for (const item of items1) {
    let similarItem = findSimilarItem({
      item,
      items: items2,
    });

    if (
      !itemsAreSame({
        item1: item,
        item2: similarItem!,
      })
    ) {
      itemsSame = false;

      if (!isFeatureItem(item)) {
        priceChanged = true;
      }
    }
  }

  // Compare free trial
  let freeTrial1 = v1Product1?.free_trial || v2Product1?.free_trial;
  let freeTrial2 = v1Product2?.free_trial || v2Product2?.free_trial;

  let freeTrialsSame = freeTrialsAreSame({
    ft1: freeTrial1,
    ft2: freeTrial2,
  });

  // Compare name
  return {
    itemsSame,
    freeTrialsSame,
    onlyEntsChanged: !itemsSame && !priceChanged,
  };
};
