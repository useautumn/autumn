import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBody, PreviewLineItem } from "@autumn/shared";
import { getCustomerSub } from "../attachUtils/convertAttachParams.js";
import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  cusProductsToPrices,
  cusProductToPrices,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { priceToUnusedPreviewItem } from "../attachPreviewUtils/priceToUnusedPreviewItem.js";
import { handleMultiAttachErrors } from "../attachUtils/handleAttachErrors/handleMultiAttachErrors.js";
import { getAddAndRemoveProducts } from "../attachFunctions/multiAttach/getAddAndRemoveProducts.js";
import { getNewProductPreview } from "./getNewProductPreview.js";
import { priceToNewPreviewItem } from "../attachPreviewUtils/priceToNewPreviewItem.js";
import { getLatestPeriodStart } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { addBillingIntervalUnix } from "@/internal/products/prices/billingIntervalUtils.js";

import { Decimal } from "decimal.js";

export const getMultiAttachPreview = async ({
  req,
  attachBody,
  attachParams,
  logger,
  config,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
  attachParams: AttachParams;
  logger: any;
  config: any;
}) => {
  await handleMultiAttachErrors({ attachParams, attachBody });

  const { customer } = attachParams;
  const cusProducts = customer.customer_products;
  const { sub } = await getCustomerSub({ attachParams });

  let items: PreviewLineItem[] = [];
  const subItems = sub?.items.data || [];

  // 1. Get remove cus products...
  const { expireCusProducts } = await getAddAndRemoveProducts({
    attachParams,
    config,
  });

  const prices = cusProductsToPrices({ cusProducts: expireCusProducts });
  const onTrial = sub?.status == "trialing";

  for (const price of prices) {
    const cusProduct = cusProducts.find(
      (cp) => cp.internal_product_id == price.internal_product_id
    )!;

    const previewLineItem = priceToUnusedPreviewItem({
      price,
      stripeItems: subItems,
      cusProduct,
      now: attachParams.now!,
      org: attachParams.org,
    });

    if (!previewLineItem) continue;

    items.push(previewLineItem);
  }

  // console.log("old items: ", items);

  const productList = attachParams.productsList!;
  const newItems: PreviewLineItem[] = [];
  for (const productOptions of productList) {
    const product = attachParams.products.find(
      (p) => p.id === productOptions.product_id
    )!;

    // Anchor to unix...
    let anchorToUnix = undefined;
    if (sub) {
      const latestPeriodStart = getLatestPeriodStart({ sub });
      const largestInterval = getLargestInterval({ prices: product.prices });
      anchorToUnix = addBillingIntervalUnix({
        unixTimestamp: latestPeriodStart * 1000,
        interval: largestInterval?.interval,
        intervalCount: largestInterval?.intervalCount,
      });
    }

    const onTrial = sub?.status == "trialing";
    for (const price of product.prices) {
      const newItem = priceToNewPreviewItem({
        org: attachParams.org,
        price,
        entitlements: product.entitlements,
        skipOneOff: false,
        now: attachParams.now!,
        anchorToUnix,
        productQuantity: productOptions.quantity ?? 1,
        product,
        onTrial,
      });

      if (newItem) {
        newItems.push(newItem);
      }
    }
  }

  // console.log("new items: ", newItems);
  const oldItemsTotal = items.reduce(
    (acc, item) => acc + (item.amount ?? 0),
    0
  );
  const totalDueToday = newItems.reduce(
    (acc, item) => acc + (item.amount ?? 0),
    0
  );

  return {
    currency: attachParams.org.default_currency,
    due_today: {
      line_items: [...items, ...newItems],
      total: new Decimal(totalDueToday).plus(oldItemsTotal).toNumber(),
    },
    due_next_cycle: null,
    options: {},
  };

  // for (const cusProduct of cusProducts) {
  //   const prices = cusProductToPrices({ cusProduct });

  //   for (const price of prices) {
  //     const previewLineItem = priceToUnusedPreviewItem({
  //       price,
  //       stripeItems: subItems,
  //       cusProduct,
  //     });

  //     if (!previewLineItem) continue;

  //     items.push(previewLineItem);
  //   }
  // }
};
