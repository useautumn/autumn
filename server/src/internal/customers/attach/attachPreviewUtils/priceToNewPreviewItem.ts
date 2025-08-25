import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import {
  getPriceEntitlement,
  getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
  isFixedPrice,
  isOneOffPrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { formatUnixToDate, formatUnixToDateTime } from "@/utils/genUtils.js";

import {
  calculateProrationAmount,
  EntitlementWithFeature,
  formatAmount,
  FullProduct,
  Organization,
  PreviewLineItem,
  Price,
} from "@autumn/shared";

export const priceToNewPreviewItem = ({
  org,
  price,
  entitlements,
  skipOneOff,
  now,
  anchorToUnix,
  productQuantity = 1,
  product,
  onTrial,
}: {
  org: Organization;
  price: Price;
  entitlements: EntitlementWithFeature[];
  skipOneOff?: boolean;
  now?: number;
  anchorToUnix?: number;
  productQuantity?: number;
  product: FullProduct;
  onTrial?: boolean;
}) => {
  if (skipOneOff && isOneOffPrice({ price })) return;

  now = now ?? Date.now();

  const ent = getPriceEntitlement(price, entitlements);

  const finalProration = getProration({
    anchorToUnix,
    now,
    interval: price.config.interval!,
    intervalCount: price.config.interval_count || 1,
  });

  // if (finalProration) {
  //   console.log("Start: ", formatUnixToDateTime(finalProration.start));
  //   console.log("End: ", formatUnixToDateTime(finalProration.end));
  // }
  // console.log("Now: ", formatUnixToDateTime(now));
  // console.log("--------------------------------");

  if (isFixedPrice({ price })) {
    let amount = priceToInvoiceAmount({
      price,
      quantity: 1,
      proration: finalProration,
      productQuantity,
      now,
    });

    if (onTrial) {
      amount = 0;
    }

    let description = newPriceToInvoiceDescription({
      org,
      price,
      product,
    });

    if (productQuantity > 1) {
      description = `${description} x ${productQuantity}`;
    }

    if (finalProration) {
      description = `${description} (from ${formatUnixToDate(now)})`;
    }

    // items.push();
    return {
      price_id: price.id,
      price: formatAmount({ org, amount }),
      description,
      amount,
      usage_model: priceToUsageModel(price),
      feature_id: ent?.feature_id,
    };
  }

  // if (billingType == BillingType.UsageInArrear) {
  //   items.push({
  //     price: getDefaultPriceStr({ org, price, ent: ent!, features }),
  //     description: newPriceToInvoiceDescription({
  //       org,
  //       price,
  //       product: newProduct,
  //     }),
  //     usage_model: priceToUsageModel(price),
  //     price_id: price.id,
  //     feature_id: ent?.feature_id,
  //   });
  // }
};
