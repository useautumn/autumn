import { AttachBranch, AttachConfig, BillingInterval } from "@autumn/shared";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { attachParamsToProduct } from "../attachUtils/convertAttachParams.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import {
  addBillingIntervalUnix,
  getAlignedIntervalUnix,
  getNextStartOfMonthUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getLastInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { getMergeCusProduct } from "../attachFunctions/addProductFlow/getMergeCusProduct.js";
import { formatUnixToDate, notNullish, nullish } from "@/utils/genUtils.js";

export const getNewProductPreview = async ({
  branch,
  attachParams,
  logger,
  config,
}: {
  branch: AttachBranch;
  attachParams: AttachParams;
  logger: any;
  config: AttachConfig;
}) => {
  const { org } = attachParams;
  const newProduct = attachParamsToProduct({ attachParams });

  let anchorToUnix = undefined;
  if (org.config.anchor_start_of_month) {
    anchorToUnix = getNextStartOfMonthUnix(BillingInterval.Month);
  }

  const { mergeCusProduct, mergeSubs } = await getMergeCusProduct({
    attachParams,
    products: [newProduct],
    config,
  });

  if (mergeSubs.length > 0) {
    anchorToUnix = mergeSubs[0].current_period_end * 1000;
  }

  const freeTrial = attachParams.freeTrial;
  const items = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now: attachParams.now,
    anchorToUnix,
    freeTrial,
    logger,
  });

  let dueNextCycle = null;
  // let oneOffOrFree =
  //   isOneOff(newProduct.prices) || isFreeProduct(newProduct.prices);
  // !oneOffOrFree &&
  if (freeTrial || notNullish(anchorToUnix)) {
    let nextCycleItems = await getItemsForNewProduct({
      newProduct,
      attachParams,
      now: attachParams.now,
      logger,
    });

    let minInterval = getLastInterval({
      prices: newProduct.prices,
      ents: newProduct.entitlements,
    });

    let getAligned = notNullish(anchorToUnix) && notNullish(minInterval);

    let dueAt = freeTrial
      ? freeTrialToStripeTimestamp({
          freeTrial,
          now: attachParams.now,
        })! * 1000
      : getAligned
        ? getAlignedIntervalUnix({
            alignWithUnix: anchorToUnix!,
            interval: minInterval,
            now: attachParams.now,
          })
        : notNullish(minInterval)
          ? addBillingIntervalUnix(attachParams.now || Date.now(), minInterval)
          : undefined;

    dueNextCycle = !nullish(dueAt)
      ? {
          line_items: nextCycleItems,
          due_at: dueAt,
        }
      : undefined;
  }

  const dueTodayAmt = items.reduce((acc, item) => {
    return acc + (item.amount ?? 0);
  }, 0);

  let options = getOptions({
    prodItems: mapToProductItems({
      prices: newProduct.prices,
      entitlements: newProduct.entitlements,
      features: attachParams.features,
    }),
    features: attachParams.features,
    anchorToUnix,
    now: attachParams.now || Date.now(),
  });

  // Next cycle at
  if (!dueNextCycle) {
    if (!isFreeProduct(newProduct.prices) && branch != AttachBranch.OneOff) {
      let minInterval = getLastInterval({ prices: newProduct.prices });
      dueNextCycle = {
        line_items: items.filter((item) => {
          let price = newProduct.prices.find(
            (price) => price.id == item.price_id,
          );
          return price?.config.interval == minInterval;
        }),
        due_at: addBillingIntervalUnix(
          attachParams.now || Date.now(),
          minInterval,
        ),
      };
    }
  }

  return {
    currency: attachParams.org.default_currency,
    due_today: {
      line_items: items,
      total: dueTodayAmt,
    },
    due_next_cycle: dueNextCycle,
    free_trial: freeTrial,
    options,
  };
};
