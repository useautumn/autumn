import {
  EntitlementWithFeature,
  FullProduct,
  Organization,
  Price,
  Feature,
  BillingInterval,
  FreeTrial,
  PreviewLineItem,
  BillingType,
  getFeatureInvoiceDescription,
  UsagePriceConfig,
  UsageModel,
  AttachConfig,
  AttachBranch,
  ProrationBehavior,
} from "@autumn/shared";
import { AttachParams } from "../../customers/cusProducts/AttachParams.js";
import {
  formatPrice,
  getBillingType,
  getPriceForOverage,
  getPriceOptions,
} from "../../products/prices/priceUtils.js";
import { getPriceEntitlement } from "../../products/prices/priceUtils.js";
import {
  isFixedPrice,
  isOneOffPrice,
  isPrepaidPrice,
  isUsagePrice,
} from "../../products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

import { newPriceToInvoiceDescription } from "../invoiceFormatUtils.js";
import { calculateProrationAmount } from "../prorationUtils.js";
import { getPricecnPrice } from "../../products/pricecn/pricecnUtils.js";
import { toProductItem } from "@autumn/shared";
import { formatAmount } from "@/utils/formatUtils.js";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";
import {
  addBillingIntervalUnix,
  addIntervalForProration,
  subtractFromUnixTillAligned,
  subtractIntervalForProration,
} from "../../products/prices/billingIntervalUtils.js";
import {
  priceToFeature,
  priceToUsageModel,
} from "@/internal/products/prices/priceUtils/convertPrice.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachUtils/getContUseItems/getContUseInvoiceItems.js";
import Stripe from "stripe";
import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
} from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { sortPricesByType } from "@/internal/products/prices/priceUtils/sortPriceUtils.js";
import { getMergeCusProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/getMergeCusProduct.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { Decimal } from "decimal.js";

export const getDefaultPriceStr = ({
  org,
  price,
  ent,
  features,
}: {
  org: Organization;
  price: Price;
  ent: EntitlementWithFeature;
  features: Feature[];
}) => {
  const item = toProductItem({
    ent: ent!,
    price,
  });

  const priceText = getPricecnPrice({
    org,
    items: [item],
    features,
    isMainPrice: true,
  });

  return `${priceText.primaryText} ${priceText.secondaryText}`;
};

export const getProration = ({
  proration,
  anchorToUnix,
  now,
  interval,
  intervalCount,
}: {
  proration?: {
    start: number;
    end: number;
  };
  anchorToUnix?: number;
  interval: BillingInterval;
  intervalCount: number;
  now: number;
}) => {
  if (!proration && !anchorToUnix) return undefined;

  if (interval == BillingInterval.OneOff) return undefined;

  if (proration) {
    return proration;
  }

  // Get end...

  const originalEnd = addIntervalForProration({
    unixTimestamp: now,
    intervalConfig: {
      interval,
      intervalCount,
    },
  });

  let end = subtractFromUnixTillAligned({
    targetUnix: anchorToUnix!,
    originalUnix: originalEnd,
  });

  let start = subtractIntervalForProration({
    unixTimestamp: end!,
    interval,
    intervalCount,
  });

  return {
    start,
    end: end!,
  };
};

export const getItemsForNewProduct = async ({
  newProduct,
  attachParams,
  now,
  proration,
  anchorToUnix,
  freeTrial,
  sub,
  logger,
  withPrepaid = false,
  branch,
  config,
  skipOneOff = false,
}: {
  newProduct: FullProduct;
  attachParams: AttachParams;
  now?: number;
  proration?: {
    start: number;
    end: number;
  };

  anchorToUnix?: number;
  freeTrial?: FreeTrial | null;
  sub?: Stripe.Subscription;
  logger: any;
  withPrepaid?: boolean;
  branch: AttachBranch;
  config: AttachConfig;
  skipOneOff?: boolean;
}) => {
  const { org, features } = attachParams;
  now = now || Date.now();

  const items: PreviewLineItem[] = [];

  sortPricesByType(newProduct.prices);

  const printLogs = false;

  for (const price of newProduct.prices) {
    if (skipOneOff && isOneOffPrice({ price })) continue;

    const ent = getPriceEntitlement(price, newProduct.entitlements);
    const billingType = getBillingType(price.config);

    if (printLogs) {
      console.log("price", formatPrice({ price }));
      console.log("now:", formatUnixToDate(now));
    }

    const finalProration = getProration({
      proration,
      anchorToUnix,
      now,
      interval: price.config.interval!,
      intervalCount: price.config.interval_count || 1,
    });

    if (printLogs && finalProration) {
      // console.log(
      //   `Proration: ${formatUnixToUTCDateTime(finalProration.start)} to ${formatUnixToUTCDateTime(finalProration.end)}`
      // );
    }

    if (isFixedPrice({ price })) {
      let amount = finalProration
        ? calculateProrationAmount({
            periodEnd: finalProration.end,
            periodStart: finalProration.start,
            now,
            amount: getPriceForOverage(price),
          })
        : getPriceForOverage(price, 0);

      if (freeTrial) {
        amount = 0;
      }

      let description = newPriceToInvoiceDescription({
        org,
        price,
        product: newProduct,
      });

      if (finalProration) {
        description = `${description} (from ${formatUnixToDate(now)})`;
      }

      items.push({
        price_id: price.id,
        price: formatAmount({ org, amount }),
        description,
        amount,
        usage_model: priceToUsageModel(price),
        feature_id: ent?.feature_id,
      });
      continue;
    }

    if (billingType == BillingType.UsageInArrear) {
      items.push({
        price: getDefaultPriceStr({ org, price, ent: ent!, features }),
        description: newPriceToInvoiceDescription({
          org,
          price,
          product: newProduct,
        }),
        usage_model: priceToUsageModel(price),
        price_id: price.id,
        feature_id: ent?.feature_id,
      });
      continue;
    }

    if (withPrepaid && isPrepaidPrice({ price })) {
      let options = getPriceOptions(price, attachParams.optionsList);
      let quantity = notNullish(options?.quantity) ? options?.quantity! : 1;

      const quantityWithBillingUnits = new Decimal(quantity).mul(
        (price.config as UsagePriceConfig).billing_units || 1
      );

      // console.log("price", price);
      // console.log("Quantity", quantity);
      let amount = priceToInvoiceAmount({
        price,
        quantity: quantityWithBillingUnits.toNumber(),
        proration: finalProration,
        now,
      });
      // console.log("Amount", amount);
      let feature = priceToFeature({
        price,
        features,
      })!;

      items.push({
        price_id: price.id,
        price: formatAmount({ org, amount: 0 }),
        description: getFeatureInvoiceDescription({
          feature,
          usage: quantity,
          billingUnits: (price.config as UsagePriceConfig).billing_units,
          prodName: newProduct.name,
          isPrepaid: true,
          fromUnix: now,
        }),
        amount,
        usage_model: UsageModel.Prepaid,
        feature_id: ent?.feature_id,
      });
    }

    if (isUsagePrice({ price })) continue;
  }

  const cusProduct = attachParamsToCurCusProduct({
    attachParams,
  });

  let { newItems } = await getContUseInvoiceItems({
    cusProduct,
    sub,
    attachParams,
    logger,
  });

  items.push(...newItems);

  for (const item of items) {
    if (item.amount && freeTrial) {
      item.amount = 0;
    }
    if (item.amount && item.amount < 0) {
      item.amount = 0;
    }
    if (notNullish(item.amount)) {
      item.price = formatAmount({ org, amount: item.amount! });
    }
  }

  return items;
};
