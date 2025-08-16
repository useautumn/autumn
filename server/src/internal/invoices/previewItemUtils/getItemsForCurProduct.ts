import Stripe from "stripe";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import {
  cusProductToEnts,
  cusProductToPrices,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getSubItemAmount } from "@/external/stripe/stripeSubUtils/getSubItemAmount.js";
import { Decimal } from "decimal.js";
import { calculateProrationAmount } from "../prorationUtils.js";
import {
  getBillingType,
  getPriceEntitlement,
} from "@/internal/products/prices/priceUtils.js";
import {
  AttachBranch,
  AttachConfig,
  BillingType,
  PreviewLineItem,
  ProrationBehavior,
} from "@autumn/shared";
import { priceToInvoiceDescription } from "../invoiceFormatUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { formatAmount } from "@/utils/formatUtils.js";
import { getProration } from "./getItemsForNewProduct.js";
import { getCusPriceUsage } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachUtils/getContUseItems/getContUseInvoiceItems.js";
import { isTrialing } from "@/internal/customers/cusProducts/cusProductUtils.js";

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

  const curPrices = cusProductToPrices({ cusProduct: curCusProduct });

  let items: PreviewLineItem[] = [];
  const subItems = sub?.items.data || [];
  let onTrial = isTrialing(curCusProduct);

  for (const item of subItems) {
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
    let totalAmount = new Decimal(totalAmountCents).div(100).toNumber();

    if (onTrial) {
      totalAmount = 0;
    }

    // const periodEnd = sub.items.data[0].current_period_end * 1000;
    const periodEnd = item.current_period_end * 1000;

    const ents = cusProductToEnts({ cusProduct: curCusProduct });
    const ent = getPriceEntitlement(price, ents);
    if (now < periodEnd) {
      const finalProration = getProration({
        now,
        interval: price.config.interval!,
        intervalCount: price.config.interval_count || 1,
        anchorToUnix: periodEnd,
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
        feature_id: ent?.feature.id,
      });
    }
  }
  // }

  let { oldItems, newItems } = await getContUseInvoiceItems({
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
