import { createStripeCli } from "@/external/stripe/utils.js";
import { FullCusProduct, FullProduct, Organization } from "@autumn/shared";

import { AppEnv } from "@autumn/shared";

import { Customer } from "@autumn/shared";
import { handleBillNowPrices } from "../add-product/handleAddProduct.js";
import { formatCurrency, getItemsHtml, itemsToHtml } from "./previewUtils.js";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import { getPriceEntitlement } from "@/internal/prices/priceUtils.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";

export const getNewProductPreview = async ({
  customer,
  org,
  env,
  product,
  curMainProduct,
  curScheduledProduct,
  cusProducts,
}: {
  customer: Customer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  curMainProduct: FullCusProduct;
  curScheduledProduct: FullCusProduct;
  cusProducts: FullCusProduct[];
}) => {
  let stripeCli = createStripeCli({ org, env });

  let res = (await handleBillNowPrices({
    sb: null,
    attachParams: {
      customer,
      org,
      products: [product],
      freeTrial: product.free_trial || null,
      invoiceOnly: false,
      prices: product.prices,
      entitlements: product.entitlements,
      cusProducts: cusProducts,
      optionsList: [],
      entities: [],
    },
    req: {
      logtail: console,
    },
    res: null,
    fromRequest: false,
    shouldPreview: true,
  })) as any;

  let items = res?.lines?.data.map((line: any) => {
    let price = product.prices.find(
      (p: any) => p.config.stripe_price_id === line.price.id
    );
    let tiers = (price?.config as any).usage_tiers;
    let entitlement;

    if (price) {
      entitlement = getPriceEntitlement(price, product.entitlements);
    }

    return {
      name: entitlement
        ? `${product.name} (${entitlement?.feature.name})`
        : `${product.name} (Base)`,
      // description: line.description,
      amount: line.amount / 100,
      currency: line.currency,
      tiers: tiers,
    };
  });

  let totalAmount = items.reduce((acc: number, item: any) => {
    return acc + item.amount;
  }, 0);

  let html = `<p>By clicking confirm, you will subscribe to ${product.name} and the following amount will be charged immediately:</p>`;
  html += getItemsHtml({ items: items, org: org });

  let message = `By clicking confirm, you will subscribe to ${
    product.name
  } and the following amount will be charged immediately: ${formatCurrency({
    amount: totalAmount,
    defaultCurrency: items?.[0]?.currency,
  })}`;

  return {
    title: `Upgrade to ${product.name}`,
    html,
    // message,
    amount_due: totalAmount,
    due_when: "immediately",
  };
};
