import {
  Organization,
  Feature,
  FullProduct,
  EntitlementWithFeature,
  AllowanceType,
  getFeatureName,
  FeatureType,
  Price,
} from "@autumn/shared";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { getProductItemDisplay } from "../products/productUtils/productResponseUtils/getProductItemDisplay.js";
import { getEntRelatedPrice } from "../products/entitlements/entitlementUtils.js";
import { isFeatureItem } from "../products/product-items/productItemUtils/getItemType.js";

export const buildInvoiceMemo = async ({
  org,
  product,
  products,
  features,
}: {
  org: Organization;
  product?: FullProduct;
  products?: FullProduct[];
  features: Feature[];
}): Promise<string> => {
  if (product) {
    const items = mapToProductItems({
      prices: product.prices,
      entitlements: product.entitlements,
      features,
    });

    const itemsToDisplay = ["Included features:"];
    for (const item of items) {
      if (!item.feature_id) continue;
      const display = getProductItemDisplay({
        item,
        features,
        currency: org.default_currency,
      });
      if (display?.primary_text) itemsToDisplay.push(display.primary_text);
    }

    return itemsToDisplay.join("\n");
  } else if (products) {
    const itemsToDisplay = ["Included features:"];

    for (const p of products) {
      const items = mapToProductItems({
        prices: p.prices,
        entitlements: p.entitlements,
        features,
      });

      console.log(
        "Items: %s",
        items.map((i) => i.feature_id)
      );

      for (const item of items) {
        if (!item.feature_id) continue;
        const display = getProductItemDisplay({
          item,
          features,
          currency: org.default_currency,
        });
        console.log(
          "Display for item %s: %s",
          item.feature_id,
          display?.primary_text
        );
        if (display?.primary_text) itemsToDisplay.push(display.primary_text);
      }
    }

    console.log("Items to display: %s", itemsToDisplay);

    let memo = itemsToDisplay.join("\n");
    if (memo.length > 490) {
      memo = memo.slice(0, 490) + "...";
    }
    return memo;
  } else return "";
};

export const buildInvoiceMemoFromEntitlements = async ({
  org,
  entitlements,
  prices,
  features,
  logger,
}: {
  org: Organization;
  entitlements: EntitlementWithFeature[];
  prices: Price[];
  features: Feature[];
  logger: any;
}) => {
  // Get item from price and ent
  const items = mapToProductItems({
    entitlements,
    prices,
    features,
  });

  if (items.filter(isFeatureItem).length === 0) return "";

  const itemsToDisplay = ["Included:"];

  for (const item of items) {
    if (!isFeatureItem(item)) continue;

    const display = getProductItemDisplay({
      item,
      features,
      currency: org.default_currency,
    });

    itemsToDisplay.push(
      `- ${display?.primary_text}${display?.secondary_text ? ` ${display?.secondary_text}` : ""}`
    );
  }

  let memo = itemsToDisplay.join("\n");
  if (memo.length > 490) {
    memo = memo.slice(0, 490) + "...";
  }
  return memo;
};
