import { createStripeCli } from "@/external/stripe/utils.js";
import {
  Feature,
  FullCusProduct,
  FullProduct,
  Organization,
  UsageModel,
} from "@autumn/shared";

import { AppEnv } from "@autumn/shared";

import { Customer } from "@autumn/shared";

import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { getProductChargeText } from "./checkProductUtils.js";
import {
  isFeatureItem,
  isPriceItem,
} from "@/internal/products/product-items/getItemType.js";
import {
  getPricecnPrice,
  sortProductItems,
} from "@/internal/products/pricecn/pricecnUtils.js";
import { formatCurrency } from "./previewUtils.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";

export const getNewProductPreview = async ({
  customer,
  org,
  env,
  product,
  curMainProduct,
  curScheduledProduct,
  cusProducts,
  features,
}: {
  customer: Customer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  curMainProduct: FullCusProduct;
  curScheduledProduct: FullCusProduct;
  cusProducts: FullCusProduct[];
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

      return {
        price: `${pricecnPrice.primaryText} ${pricecnPrice.secondaryText}`,
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
    title,
    message,
    items: lineItems,
    options,
    due_immediately: {
      price: dueToday,
      currency: org.default_currency || "USD",
    },
  };
};
