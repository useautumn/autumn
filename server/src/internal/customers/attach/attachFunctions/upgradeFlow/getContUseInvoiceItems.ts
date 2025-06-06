import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { cusProductsToCusPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getItemsForCurProduct } from "@/internal/invoices/previewItemUtils/getItemsForCurProduct.js";
import {
  BillingType,
  Entitlement,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  FullEntitlement,
  getFeatureInvoiceDescription,
  InvoiceItem,
  OnIncrease,
  PreviewLineItem,
  Price,
  UsagePriceConfig,
  usageToFeatureName,
} from "@autumn/shared";
import Stripe from "stripe";
import { attachParamsToProduct } from "../../attachUtils/convertAttachParams.js";
import {
  getBillingType,
  getPriceEntitlement,
} from "@/internal/products/prices/priceUtils.js";
import { findCusEntByFeatureId } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import {
  getExistingUsageFromCusProducts,
  getRelatedCusPrice,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getPrevAndNewPriceForUpgrade } from "@/trigger/arrearProratedUsage/handleProratedUpgrade.js";
import { getUpgradeProrationInvoiceItem } from "@/trigger/arrearProratedUsage/createUpgradeProrationInvoice.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/getAmountForPrice.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { getCycleWillReset } from "../../attachUtils/attachUtils.js";
import { Decimal } from "decimal.js";
import { shouldProrate } from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { getNewContUsageAmount } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getContUsageUpgradeItem.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";
import { getReplaceables } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getContUsageDowngradeItem.js";
import { getUsageDiffLineItem } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getUsageDiffLineItem.js";
import { getCurContUseItems } from "@/internal/invoices/previewItemUtils/getCurContUseItems.js";

export const getContUsageItems = async ({
  price,
  ent,
  prevCusEnt,
  prevCusPrice,
  attachParams,
  sub,
  logger,
  curItems,
}: {
  price: Price;
  ent: FullEntitlement;
  prevCusEnt?: FullCustomerEntitlement;
  prevCusPrice?: FullCustomerPrice;
  attachParams: AttachParams;
  sub: Stripe.Subscription | undefined;
  logger: any;
  curItems: PreviewLineItem[];
}) => {
  const { cusProducts, entities, internalEntityId, now } = attachParams;
  const product = attachParamsToProduct({ attachParams });
  const prevEnt = prevCusEnt?.entitlement;
  const billingUnits = (price.config as UsagePriceConfig).billing_units || 1;

  // 1. Get current usage
  let curUsage = getExistingUsageFromCusProducts({
    entitlement: ent,
    cusProducts,
    entities,
    carryExistingUsages: true,
    internalEntityId,
  });

  let newBalance = ent.allowance! - curUsage;
  let prevBalance = prevEnt ? prevEnt.allowance! - curUsage : 0;

  // 2. Get
  const { prevRoundedOverage, newRoundedOverage, newRoundedUsage, newUsage } =
    getPrevAndNewPriceForUpgrade({
      ent,
      numReplaceables: prevCusEnt?.replaceables.length || 0,
      price,
      newBalance,
      prevBalance,
      logger,
    });

  let prevInvoiceItem = curItems.find(
    (item) => item.price_id === prevCusPrice?.price.id,
  );

  let newOverageAmount = priceToInvoiceAmount({
    price,
    overage: prevRoundedOverage,
    now: now || Date.now(),
    proration: sub
      ? {
          start: sub.current_period_start * 1000,
          end: sub.current_period_end * 1000,
        }
      : undefined,
  });

  let newUsageAmount = getNewContUsageAmount({
    price,
    ent,
    newBalance,
    prevBalance,
    stripeSub: sub,
    now: now || Date.now(),
  });

  logger.info(`Prev item amount: ${prevInvoiceItem?.amount}`);
  logger.info(`New item amount:  ${newOverageAmount}`);
  logger.info(`New usage amount: ${newUsageAmount}`);

  let replaceables = getReplaceables({
    cusEnt: prevCusEnt!,
    prevOverage: prevRoundedOverage,
    newOverage: newRoundedOverage,
  });

  let prevItemAmount = new Decimal(
    prevInvoiceItem?.amount ?? 0,
  ).toDecimalPlaces(2);
  let newItemAmount = new Decimal(newOverageAmount).toDecimalPlaces(2);

  const onlyUsageItems = prevItemAmount.add(newItemAmount).eq(0);
  const isIncrease = newBalance <= prevBalance;
  const willProrate = isIncrease
    ? shouldProrate(price.proration_config?.on_increase)
    : shouldProrate(price.proration_config?.on_decrease);

  // Case 1: Prev amount = new amount

  const newUsageLineItem = getUsageDiffLineItem({
    prevBalance,
    newBalance,
    price,
    ent,
    product,
    newUsageAmount,
    org: attachParams.org,
  });

  if (onlyUsageItems) {
    return {
      oldItem: null,
      newItems: [newUsageLineItem],
      replaceables,
    };
  }

  // Case 2: Proration involved
  let oldItem = prevInvoiceItem;
  let newItems = [];
  let start = formatUnixToDate(now);

  if (willProrate) {
    const description = getFeatureInvoiceDescription({
      feature: ent.feature,
      usage: newRoundedUsage,
      billingUnits: (price.config as UsagePriceConfig).billing_units,
      prodName: product.name,
    });

    newItems.push(
      constructPreviewItem({
        price,
        org: attachParams.org,
        amount: new Decimal(newOverageAmount).plus(newUsageAmount).toNumber(),
        description: `${description} (from ${start})`,
      }),
    );
  } else {
    const usageDiff = new Decimal(prevBalance).sub(newBalance).toNumber();
    const usage = new Decimal(newUsage).sub(usageDiff).toNumber();
    const newRoundedUsage = new Decimal(usage)
      .div(billingUnits)
      .ceil()
      .mul(billingUnits)
      .toNumber();

    // logger.info(`Usage diff: ${usageDiff}`);
    // logger.info(`New rounded usage: ${newRoundedUsage}`);

    let overageDescription = getFeatureInvoiceDescription({
      feature: ent.feature,
      usage: usage,
      billingUnits: billingUnits,
      prodName: product.name,
    });

    let newPreviewItem = constructPreviewItem({
      price,
      org: attachParams.org,
      amount: newOverageAmount,
      description: `${overageDescription} (from ${start})`,
    });

    newItems = [newPreviewItem, newUsageLineItem];
  }

  return {
    oldItem,
    newItems,
    replaceables,
  };
};

export const getContUseInvoiceItems = async ({
  cusProduct,
  stripeSubs,
  attachParams,
  logger,
}: {
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  attachParams: AttachParams;
  logger: any;
}) => {
  let cusPrices = cusProductsToCusPrices({
    cusProducts: [cusProduct],
    billingType: BillingType.InArrearProrated,
  });
  const now = attachParams.now || Date.now();
  const cusEnts = cusProduct.customer_entitlements;
  const product = attachParamsToProduct({ attachParams });

  const cycleWillReset = getCycleWillReset({
    attachParams,
    stripeSubs,
  });

  const curItems = await getCurContUseItems({
    stripeSubs,
    attachParams,
    now: now || Date.now(),
  });

  let newEnts = product.entitlements;

  let oldItems = [];
  let newItems = [];
  let replaceables = [];

  for (const price of product.prices) {
    let billingType = getBillingType(price.config);
    if (billingType !== BillingType.InArrearProrated) {
      continue;
    }

    let ent = getPriceEntitlement(price, newEnts);

    let prevCusEnt = findCusEntByFeatureId({
      cusEnts,
      feature: ent.feature,
    });

    let prevCusPrice = prevCusEnt
      ? getRelatedCusPrice(prevCusEnt!, cusPrices)
      : undefined;

    let sub = !cycleWillReset
      ? stripeSubs.find(
          (sub) => subToAutumnInterval(sub) === price.config.interval,
        )
      : undefined;

    let {
      oldItem,
      newItems: itemsToAdd,
      replaceables: replaceablesToAdd,
    } = await getContUsageItems({
      price,
      ent,
      prevCusEnt,
      prevCusPrice,
      attachParams,
      sub,
      logger,
      curItems,
    });

    if (oldItem) {
      oldItems.push(oldItem);
    }

    newItems.push(...itemsToAdd.filter((item) => item.amount !== 0));

    replaceables.push(...(replaceablesToAdd || []));

    // if (oldItem) {
    //   logger.info(`${oldItem.description} | Amount: ${oldItem.amount}`);
    // }

    // for (const item of newItems) {
    //   logger.info(`${item.description} | Amount: ${item.amount}`);
    // }

    // if (replaceables) {
    //   logger.info(`Number of replaceables: ${replaceables.length}`);
    // }
  }
  return {
    oldItems,
    newItems,
    replaceables,
  };
};
