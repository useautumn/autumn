import { AttachBranch, BillingInterval } from "@autumn/shared";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { attachParamsToProduct } from "../attachUtils/convertAttachParams.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import {
  addBillingIntervalUnix,
  getNextStartOfMonthUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getLastInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";

export const getNewProductPreview = async ({
  branch,
  attachParams,
  now,
  logger,
}: {
  branch: AttachBranch;
  attachParams: AttachParams;
  now: number;
  logger: any;
}) => {
  const { org } = attachParams;
  const newProduct = attachParamsToProduct({ attachParams });

  let anchorToUnix = undefined;
  if (org.config.anchor_start_of_month) {
    anchorToUnix = getNextStartOfMonthUnix(BillingInterval.Month);
  }

  const freeTrial = attachParams.freeTrial;
  const items = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now,
    anchorToUnix,
    freeTrial,
    logger,
  });

  let dueNextCycle = null;

  let dueTodayFree =
    items.reduce((acc, item) => {
      return acc + (item.amount ?? 0);
    }, 0) === 0;

  // || dueTodayFree || branch == AttachBranch.SameCustomEnts
  if (freeTrial) {
    let nextCycleItems = await getItemsForNewProduct({
      newProduct,
      attachParams,
      now,
      logger,
    });

    let minInterval = getLastInterval({ prices: newProduct.prices });
    let dueAt = freeTrial
      ? freeTrialToStripeTimestamp({
          freeTrial,
          now,
        })! * 1000
      : addBillingIntervalUnix(now, minInterval);

    dueNextCycle = {
      line_items: nextCycleItems,
      due_at: dueAt,
    };
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
  });

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
