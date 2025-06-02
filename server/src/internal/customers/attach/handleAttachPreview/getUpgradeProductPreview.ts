import {
  BillingType,
  Feature,
  FullProduct,
  Organization,
} from "@autumn/shared";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { getNextCycle } from "../attachFunctions/upgradeFlow/upgradeUtils.js";
import Stripe from "stripe";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { Decimal } from "decimal.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import {
  newPriceToInvoiceDescription,
  priceToInvoiceDescription,
} from "@/internal/invoices/invoiceFormatUtils.js";
import {
  getBillingType,
  getPriceEntitlement,
  getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";
import { getCusPriceUsage } from "../../cusProducts/cusPrices/cusPriceUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import { getSubItemAmount } from "@/external/stripe/stripeSubUtils/getSubItemAmount.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { getExistingUsageFromCusProducts } from "../../cusProducts/cusEnts/cusEntUtils.js";
import {
  isFixedPrice,
  isUsagePrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils.js";
import { getFirstInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";

export const getUpgradeProductPreview = async ({
  req,
  attachParams,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
}) => {
  const { logtail: logger } = req;

  const { stripeCli } = attachParams;

  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const curCusProduct = curMainProduct!;
  const curPrices = cusProductToPrices({ cusProduct: curCusProduct });

  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids || [],
    expand: ["items.data.price.tiers"],
  });

  const now = await getStripeNow({ stripeCli, stripeSub: stripeSubs[0] });

  // Get prorated refunds for old product
  for (const sub of stripeSubs) {
    for (const item of sub.items.data) {
      const price = findPriceInStripeItems({
        prices: curPrices,
        subItem: item,
      });

      if (!price) continue;
      const billingType = getBillingType(price.config);
      if (billingType == BillingType.UsageInArrear) continue;

      const totalAmount = getSubItemAmount({ subItem: item });

      const periodEnd = sub.current_period_end * 1000;
      const periodStart = sub.current_period_start * 1000;

      if (now < periodEnd) {
        const proratedAmount = calculateProrationAmount({
          periodEnd,
          periodStart,
          now,
          amount: totalAmount,
        });

        const description = priceToInvoiceDescription({
          price,
          cusProduct: curCusProduct,
          quantity: item.quantity,
          logger,
        });

        console.log("Item:", description);
        console.log("Period ends:", formatUnixToDateTime(periodEnd));
        console.log("Prorated amount: ", proratedAmount);
        console.log("--------------------------------");
      }
    }
  }

  // Get prorated amounts for new product
  const newProduct = attachParamsToProduct({ attachParams });

  // Check if new product will have cycle reset
  const firstInterval = getFirstInterval({ prices: newProduct.prices });
  const prevInterval = subToAutumnInterval(stripeSubs[0]);
  const cycleWillReset = prevInterval !== firstInterval;

  console.log("Cycle will reset: ", cycleWillReset);

  for (const price of newProduct.prices) {
    const ent = getPriceEntitlement(price, newProduct.entitlements);
    const billingType = getBillingType(price.config);

    if (
      billingType == BillingType.UsageInArrear ||
      billingType == BillingType.UsageInAdvance
    ) {
      continue;
    }

    let amount, usage;
    if (isFixedPrice({ price })) {
      amount = getPriceForOverage(price);
    } else {
      usage = getExistingUsageFromCusProducts({
        entitlement: ent,
        cusProducts: attachParams.cusProducts,
        entities: attachParams.entities,
        carryExistingUsages: undefined,
        internalEntityId: attachParams.internalEntityId,
      });

      const overage = new Decimal(usage).sub(ent.allowance!).toNumber();
      amount = getPriceForOverage(price, overage);
    }

    const description = newPriceToInvoiceDescription({
      price,
      product: newProduct,
      quantity: usage,
    });

    const proratedAmount = calculateProrationAmount({
      periodEnd: stripeSubs[0].current_period_end * 1000,
      periodStart: now,
      now,
      amount,
    });

    console.log("Item:", description);
    console.log("Amount: ", amount);
    console.log("--------------------------------");
  }
};
