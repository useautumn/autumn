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
import { isFeatureItem } from "@/internal/products/product-items/getItemType.js";
import { sortProductItems } from "@/internal/products/pricecn/pricecnUtils.js";

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
  let stripeCli = createStripeCli({ org, env });

  let productV2 = mapToProductV2({
    product,
    features,
  });

  let sortedItems = sortProductItems(productV2.items, features);
  let items = sortedItems.filter((i) => !isFeatureItem(i));
  let itemStrs = getProductChargeText({
    product: productV2,
    org,
    features,
  });

  let message = `By clicking confirm, you will subscribe to ${product.name} and the following amount will be charged:\n`;
  for (let item of itemStrs) {
    message += `\n${item}`;
  }

  let title = "";
  if (isOneOff(product.prices)) {
    title = `Purchase ${product.name}`;
  } else {
    title = `Subscribe to ${product.name}`;
  }

  let options = items
    .filter((i) => isFeaturePriceItem(i) && i.usage_model == UsageModel.Prepaid)
    .map((i) => {
      return {
        feature_id: i.feature_id,
        feature_name: features.find((f) => f.id == i.feature_id)?.name,
        billing_units: i.billing_units,
      };
    });

  return {
    title,
    message,
    due_when: "immediately",
    options,
  };
};
