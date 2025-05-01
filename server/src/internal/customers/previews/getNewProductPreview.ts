import { createStripeCli } from "@/external/stripe/utils.js";
import {
  BillingType,
  CheckProdItemSchema,
  Feature,
  FullCusProduct,
  FullProduct,
  Organization,
} from "@autumn/shared";

import { AppEnv } from "@autumn/shared";

import { Customer } from "@autumn/shared";
import {
  handleBillNowPrices,
  handleOneOffPrices,
} from "../add-product/handleAddProduct.js";
import { formatCurrency, getItemsHtml, itemsToHtml } from "./previewUtils.js";
import {
  mapToProductItems,
  mapToProductV2,
} from "@/internal/products/productV2Utils.js";
import {
  getBillingType,
  getPriceEntitlement,
} from "@/internal/prices/priceUtils.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { itemToPriceOrTiers } from "@/internal/products/product-items/productItemUtils.js";
import { getItemDescription } from "./checkProductUtils.js";
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
  let items = sortedItems
    .filter((i) => !isFeatureItem(i))
    .map((item) => {
      return {
        description: getItemDescription({
          item,
          features,
          product: productV2,
          org,
        }),
      };
    });

  console.log("items", items);
  throw new Error("Not implemented");

  // if (isOneOff(product.prices)) {
  //   let invoiceItems = await handleOneOffPrices({
  //     sb: null,
  //     attachParams,
  //     req: {
  //       logtail: console,
  //     },
  //     res: null,
  //     fromRequest: false,
  //     shouldPreview: true,
  //   }) || [];

  //   for (let item of invoiceItems) {
  //     delete item.description;
  //   }
  //   throw new Error("Not implemented");
  //   // let items = res?.lines?.data.map((line: any) => {
  //   //   return {
  //   //     name: line.description,
  //   //     amount: line.amount / 100,
  //   //     currency: line.currency,
  //   //   };
  //   // });
  // } else {
  //   res = (await handleBillNowPrices({
  //     sb: null,
  //     attachParams,
  //     req: {
  //       logtail: console,
  //     },
  //     res: null,
  //     fromRequest: false,
  //     shouldPreview: true,
  //   })) as any;

  //   let items = res?.lines?.data.map((line: any) => {
  //     let price = product.prices.find(
  //       (p: any) => p.config.stripe_price_id === line.price.id
  //     );
  //     let tiers = (price?.config as any)?.usage_tiers;
  //     let entitlement;

  //     if (price) {
  //       entitlement = getPriceEntitlement(price, product.entitlements);
  //     }

  //     return {
  //       name: entitlement
  //         ? `${product.name} (${entitlement?.feature.name})`
  //         : `${product.name} (Base)`,
  //       // description: line.description,
  //       amount: line.amount / 100,
  //       currency: line.currency,
  //       tiers: tiers,
  //     };
  //   });
  // }

  // let html = `<p>By clicking confirm, you will subscribe to ${product.name} and the following amount will be charged immediately:</p>`;
  // html += getItemsHtml({ items: items, org: org });

  // ${formatCurrency({
  //   amount: totalAmount,
  //   defaultCurrency: items?.[0]?.currency,
  // })}

  let message = `By clicking confirm, you will subscribe to ${product.name} and the following amount will be charged immediately:`;

  // console.log("items", items);
  return {
    title: `Upgrade to ${product.name}`,
    message,
    line_items: items,
    due_when: "immediately",
  };
};
