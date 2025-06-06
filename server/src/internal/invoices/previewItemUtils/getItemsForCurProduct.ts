import Stripe from "stripe";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getSubItemAmount } from "@/external/stripe/stripeSubUtils/getSubItemAmount.js";
import { Decimal } from "decimal.js";
import { calculateProrationAmount } from "../prorationUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { BillingType, PreviewLineItem } from "@autumn/shared";
import { priceToInvoiceDescription } from "../invoiceFormatUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { formatAmount } from "@/utils/formatUtils.js";
import { getProration } from "./getItemsForNewProduct.js";
import { getCusPriceUsage } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachFunctions/upgradeFlow/getContUseInvoiceItems.js";

export const getItemsForCurProduct = async ({
  stripeSubs,
  attachParams,
  now,
  logger,
}: {
  stripeSubs: Stripe.Subscription[];
  attachParams: AttachParams;
  now: number;
  logger: any;
}) => {
  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const curCusProduct = curMainProduct!;
  const curPrices = cusProductToPrices({ cusProduct: curCusProduct });

  let items: PreviewLineItem[] = [];
  for (const sub of stripeSubs) {
    for (const item of sub.items.data) {
      const price = findPriceInStripeItems({
        prices: curPrices,
        subItem: item,
      });

      if (!price) continue;
      const billingType = getBillingType(price.config);

      if (
        billingType == BillingType.UsageInArrear ||
        billingType == BillingType.InArrearProrated
      )
        continue;

      const totalAmountCents = getSubItemAmount({ subItem: item });
      const totalAmount = new Decimal(totalAmountCents).div(100).toNumber();

      if (totalAmount == 0) continue;

      const periodEnd = sub.current_period_end * 1000;

      if (now < periodEnd) {
        const finalProration = getProration({
          now,
          interval: price.config.interval!,
          anchorToUnix: sub.current_period_end * 1000,
        })!;

        const proratedAmount = -calculateProrationAmount({
          periodEnd: finalProration?.end,
          periodStart: finalProration?.start,
          now,
          amount: totalAmount,
        });

        let description = priceToInvoiceDescription({
          price,
          org: attachParams.org,
          cusProduct: curCusProduct,
          quantity: item.quantity,
          logger,
        });

        description = `Unused ${description} (from ${formatUnixToDate(now)})`;

        items.push({
          price: formatAmount({
            org: attachParams.org,
            amount: proratedAmount,
          }),
          description,
          amount: proratedAmount,
          usage_model: priceToUsageModel(price),
          price_id: price.id!,
        });
      }
    }
  }

  let { oldItems, newItems } = await getContUseInvoiceItems({
    stripeSubs,
    attachParams,
    logger,
    cusProduct: curCusProduct,
  });

  items = [...items, ...(oldItems || []), ...(newItems || [])];

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
