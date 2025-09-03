import Stripe from "stripe";

import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { cusProductToPrices } from "@autumn/shared";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import {
  AttachBranch,
  AttachConfig,
  BillingType,
  PreviewLineItem,
} from "@autumn/shared";

import { formatAmount } from "@/utils/formatUtils.js";

import { getCusPriceUsage } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachUtils/getContUseItems/getContUseInvoiceItems.js";

import {
  isArrearPrice,
  isContUsePrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { priceToUnusedPreviewItem } from "@/internal/customers/attach/attachPreviewUtils/priceToUnusedPreviewItem.js";

export const getItemsForCurProduct = async ({
  // stripeSubs,
  sub,
  attachParams,
  branch,
  config,
  now,
  logger,
}: {
  // stripeSubs: Stripe.Subscription[];
  sub?: Stripe.Subscription;
  attachParams: AttachParams;
  branch: AttachBranch;
  config: AttachConfig;
  now: number;
  logger: any;
}) => {
  const { curMainProduct, curSameProduct } = attachParamToCusProducts({
    attachParams,
  });

  const curCusProduct = curSameProduct || curMainProduct!;

  let items: PreviewLineItem[] = [];
  const subItems = sub?.items.data || [];
  const curPrices = cusProductToPrices({ cusProduct: curCusProduct });

  for (const price of curPrices) {
    if (isArrearPrice({ price }) || isContUsePrice({ price })) {
      continue;
    }

    const previewLineItem = priceToUnusedPreviewItem({
      price,
      stripeItems: subItems,
      cusProduct: curCusProduct,
      org: attachParams.org,
      now,
      latestInvoice: sub?.latest_invoice as Stripe.Invoice,
      subDiscounts: sub?.discounts as Stripe.Discount[],
    });

    if (!previewLineItem) continue;

    items.push(previewLineItem);
  }

  // console.log("items: ", items);

  let { oldItems } = await getContUseInvoiceItems({
    sub,
    attachParams,
    logger,
    cusProduct: curCusProduct,
  });

  items = [...items, ...oldItems];

  for (const price of curPrices) {
    let billingType = getBillingType(price.config);

    if (billingType == BillingType.UsageInArrear) {
      const { amount, description } = getCusPriceUsage({
        price,
        cusProduct: curCusProduct,
        logger,
      });

      if (!amount || amount <= 0) continue;

      items.push({
        price: formatAmount({
          org: attachParams.org,
          amount,
        }),
        description,
        amount,
        price_id: price.id!,
        usage_model: priceToUsageModel(price),
      });
    }
  }

  return items;
};

// for (const item of subItems) {
//   const price = findPriceInStripeItems({
//     prices: curPrices,
//     subItem: item,
//   });

//   // Get quantity of current price...

//   if (!price) continue;
//   const billingType = getBillingType(price.config);

//   if (
//     billingType == BillingType.UsageInArrear ||
//     billingType == BillingType.InArrearProrated
//   )
//     continue;

//   const totalAmountCents = getSubItemAmount({ subItem: item });
//   console.log("Sub item amount:", totalAmountCents);
//   let totalAmount = new Decimal(totalAmountCents).div(100).toNumber();

//   if (onTrial) {
//     totalAmount = 0;
//   }

//   // const periodEnd = sub.items.data[0].current_period_end * 1000;
//   const periodEnd = item.current_period_end * 1000;

//   const ents = cusProductToEnts({ cusProduct: curCusProduct });
//   const ent = getPriceEntitlement(price, ents);
//   if (now < periodEnd) {
//     const finalProration = getProration({
//       now,
//       interval: price.config.interval!,
//       intervalCount: price.config.interval_count || 1,
//       anchorToUnix: periodEnd,
//     })!;

//     const proratedAmount = -calculateProrationAmount({
//       periodEnd: finalProration?.end,
//       periodStart: finalProration?.start,
//       now,
//       amount: totalAmount,
//     });

//     let description = priceToInvoiceDescription({
//       price,
//       org: attachParams.org,
//       cusProduct: curCusProduct,
//       quantity: item.quantity,
//       logger,
//     });

//     description = `Unused ${description} (from ${formatUnixToDate(now)})`;

//     items.push({
//       price: formatAmount({
//         org: attachParams.org,
//         amount: proratedAmount,
//       }),
//       description,
//       amount: proratedAmount,
//       usage_model: priceToUsageModel(price),
//       price_id: price.id!,
//       feature_id: ent?.feature.id,
//     });
//   }
// }
