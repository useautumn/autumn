import { Feature, FullProduct, Organization } from "@autumn/shared";
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
import { getItemDescription } from "./checkProductUtils.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { AttachPreviewType } from "@autumn/shared";

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
    .filter((i) => !isFeatureItem(i))
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
        usage_model: isFeaturePriceItem(i) ? i.usage_model : undefined,
      };
    });

  let dueToday = Number(
    sortedItems
      .filter((i) => isPriceItem(i))
      .reduce((sum, i) => sum + i.price!, 0)
      .toFixed(2)
  );

  let type = "Subscribe to";
  if (isOneOff(product.prices)) {
    type = "Purchase";
  }
  let title = `${type} ${product.name}`;
  let message = `By clicking confirm, you will ${type.toLowerCase()} ${
    product.name
  } and the following amount will be charged:\n`;

  let options = getOptions({
    prodItems: productV2.items,
    features,
  });

  return {
    // title,
    // message,
    scenario: AttachPreviewType.New,
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
