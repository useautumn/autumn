import { getSubItemAmount } from "@/external/stripe/stripeSubUtils/getSubItemAmount.js";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

import {
  BillingType,
  getFeatureInvoiceDescription,
  PreviewLineItem,
  UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import Stripe from "stripe";
import { getProration } from "./getItemsForNewProduct.js";
import { calculateProrationAmount } from "../prorationUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { formatAmount } from "@/utils/formatUtils.js";
import {
  priceToFeature,
  priceToUsageModel,
} from "@/internal/products/prices/priceUtils/convertPrice.js";
import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { cusProductToEnts, cusProductToPrices } from "@autumn/shared";
import { getExistingUsageFromCusProducts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";

export const getCurContUseItems = async ({
  sub,
  attachParams,
}: {
  sub: Stripe.Subscription;
  attachParams: AttachParams;
}) => {
  const { features } = attachParams;
  const { curMainProduct, curSameProduct } = attachParamToCusProducts({
    attachParams,
  });
  const curCusProduct = curSameProduct || curMainProduct!;
  const curPrices = cusProductToPrices({ cusProduct: curCusProduct });
  const curEnts = cusProductToEnts({ cusProduct: curCusProduct });

  let items: PreviewLineItem[] = [];
  let now = attachParams.now || Date.now();

  for (const item of sub.items.data) {
    const price = findPriceInStripeItems({
      prices: curPrices,
      subItem: item,
      billingType: BillingType.InArrearProrated,
    });

    if (!price) continue;

    const periodEnd = item.current_period_end * 1000;
    const totalAmountCents = getSubItemAmount({ subItem: item });
    const totalAmount = new Decimal(totalAmountCents).div(100).toNumber();
    const ent = getPriceEntitlement(price, curEnts);

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

      const existingUsage = getExistingUsageFromCusProducts({
        entitlement: ent!,
        cusProducts: [curCusProduct],
        entities: attachParams.entities,
        carryExistingUsages: true,
        internalEntityId: attachParams.internalEntityId,
      });

      const feature = priceToFeature({ price, features });

      let description = getFeatureInvoiceDescription({
        feature: feature!,
        usage: existingUsage,
        billingUnits: (price.config as UsagePriceConfig).billing_units,
        prodName: curMainProduct?.product.name,
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

  return items;
};
