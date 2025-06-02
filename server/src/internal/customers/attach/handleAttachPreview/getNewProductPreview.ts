import { Feature, FullProduct, Organization, UsageModel } from "@autumn/shared";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import { isOneOff } from "@/internal/products/productUtils.js";

import {
  isFeatureItem,
  isPriceItem,
} from "@/internal/products/product-items/getItemType.js";
import {
  getPricecnPrice,
  sortProductItems,
} from "@/internal/products/pricecn/pricecnUtils.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { AttachScenario } from "@autumn/shared";
import { getItemDescription } from "../../previews/checkProductUtils.js";

export const getNewProductPreview = async ({
  org,
  product,
  features,
}: {
  org: Organization;
  product: FullProduct;
  features: Feature[];
}) => {
  let productV2 = mapToProductV2({
    product,
    features,
  });

  let sortedItems = sortProductItems(productV2.items, features);

  let lineItems = sortedItems
    .filter((i) => !isFeatureItem(i) && i.usage_model != UsageModel.Prepaid)
    .map((i, index) => {
      let pricecnPrice = getPricecnPrice({
        org,
        items: [i],
        features,
        isMainPrice: index == 0,
      });

      let description = getItemDescription({
        item: i,
        features,
        product: productV2,
        org,
      });

      return {
        description,
        price: `${pricecnPrice.primaryText} ${pricecnPrice.secondaryText}`,
      };
    });

  let dueToday = Number(
    sortedItems
      .filter((i) => isPriceItem(i))
      .reduce((sum, i) => sum + i.price!, 0)
      .toFixed(2),
  );

  let options = getOptions({
    prodItems: productV2.items,
    features,
  });

  return {
    scenario: AttachScenario.New,
    product_id: product.id,
    product_name: product.name,
    recurring: !isOneOff(product.prices),

    items: lineItems,
    options,
    due_today: {
      price: dueToday,
      currency: org.default_currency || "USD",
    },
  };
};
