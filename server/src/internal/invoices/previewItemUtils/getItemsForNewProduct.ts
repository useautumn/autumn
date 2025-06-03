import {
  BillingType,
  EntitlementWithFeature,
  FullProduct,
  Organization,
  UsagePriceConfig,
  PreviewItem,
  Price,
  Feature,
  BillingInterval,
  FreeTrial,
} from "@autumn/shared";
import { AttachParams } from "../../customers/cusProducts/AttachParams.js";
import {
  getBillingType,
  getPriceForOverage,
} from "../../products/prices/priceUtils.js";
import { getPriceEntitlement } from "../../products/prices/priceUtils.js";
import { isFixedPrice } from "../../products/prices/priceUtils/usagePriceUtils.js";
import { getExistingUsageFromCusProducts } from "../../customers/cusProducts/cusEnts/cusEntUtils.js";
import { Decimal } from "decimal.js";
import { newPriceToInvoiceDescription } from "../invoiceFormatUtils.js";
import { calculateProrationAmount } from "../prorationUtils.js";
import { getPricecnPrice } from "../../products/pricecn/pricecnUtils.js";
import { toProductItem } from "../../products/product-items/mapToItem.js";
import { formatAmount } from "@/utils/formatUtils.js";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";
import {
  getAlignedIntervalUnix,
  getNextStartOfMonthUnix,
  subtractBillingIntervalUnix,
} from "../../products/prices/billingIntervalUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";

const getDefaultPriceStr = ({
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
}: {
  proration?: {
    start: number;
    end: number;
  };
  anchorToUnix?: number;
  interval: BillingInterval;
  now: number;
}) => {
  if (!proration && !anchorToUnix) return undefined;

  if (proration) {
    return proration;
  }

  let end = getAlignedIntervalUnix({
    alignWithUnix: anchorToUnix!,
    interval,
    now,
    alwaysReturn: true,
  });
  let start = subtractBillingIntervalUnix(end!, interval);

  return {
    start,
    end: end!,
  };
};

export const getItemsForNewProduct = ({
  newProduct,
  attachParams,
  now,
  proration,
  interval,
  anchorToUnix,
  freeTrial,
}: {
  newProduct: FullProduct;
  attachParams: AttachParams;
  now?: number;
  proration?: {
    start: number;
    end: number;
  };
  interval?: BillingInterval;
  anchorToUnix?: number;
  freeTrial?: FreeTrial | null;
}) => {
  const { org, features } = attachParams;

  now = now || Date.now();

  const items: PreviewItem[] = [];

  for (const price of newProduct.prices) {
    const ent = getPriceEntitlement(price, newProduct.entitlements);
    const billingType = getBillingType(price.config);

    if (interval && price.config.interval !== interval) continue;

    const finalProration = getProration({
      proration,
      anchorToUnix,
      now,
      interval: price.config.interval!,
    });

    if (isFixedPrice({ price })) {
      const amount = finalProration
        ? calculateProrationAmount({
            periodEnd: finalProration.end,
            periodStart: finalProration.start,
            now,
            amount: getPriceForOverage(price),
          })
        : getPriceForOverage(price, 0);

      let description = newPriceToInvoiceDescription({
        org,
        price,
        product: newProduct,
      });

      if (proration) {
        description = `${description} (from ${formatUnixToDate(now)})`;
      }

      items.push({
        // price: formatAmount({ org, amount }),
        price: "",
        description,
        amount,
        usage_model: priceToUsageModel(price),
      });
      continue;
    }

    if (billingType == BillingType.UsageInAdvance) continue;

    if (billingType == BillingType.UsageInArrear) {
      items.push({
        price: getDefaultPriceStr({ org, price, ent, features }),
        description: newPriceToInvoiceDescription({
          org,
          price,
          product: newProduct,
        }),
        usage_model: priceToUsageModel(price),
      });
      continue;
    }

    const usage = getExistingUsageFromCusProducts({
      entitlement: ent,
      cusProducts: attachParams.cusProducts,
      entities: attachParams.entities,
      carryExistingUsages: undefined,
      internalEntityId: attachParams.internalEntityId,
    });

    let description = newPriceToInvoiceDescription({
      org,
      price,
      product: newProduct,
      quantity: usage,
    });

    if (usage == 0) {
      items.push({
        price: getDefaultPriceStr({ org, price, ent, features }),
        description,
        usage_model: priceToUsageModel(price),
      });
    } else {
      const overage = new Decimal(usage).sub(ent.allowance!).toNumber();
      const amount = finalProration
        ? calculateProrationAmount({
            periodEnd: finalProration.end,
            periodStart: finalProration.start,
            now,
            amount: getPriceForOverage(price, overage),
          })
        : getPriceForOverage(price, overage);

      if (proration) {
        description = `${description} (from ${formatUnixToDate(now)})`;
      }

      items.push({
        price: "",
        description,
        amount,
        usage_model: priceToUsageModel(price),
      });
    }

    // // const finalAmount = cycleWillReset ? amount : proratedAmount;

    // console.log("Item:", description);
    // console.log("Amount: ", amount);
    // console.log("--------------------------------");
  }

  for (const item of items) {
    if (item.amount && freeTrial) {
      item.amount = 0;
    }
    if (notNullish(item.amount)) {
      item.price = formatAmount({ org, amount: item.amount! });
    }
  }

  return items;
};
