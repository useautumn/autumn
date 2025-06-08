import { BillingInterval } from "@autumn/shared";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { attachParamsToProduct } from "../attachUtils/convertAttachParams.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";

export const getNewProductPreview = async ({
  attachParams,
  now,
  logger,
}: {
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
  if (freeTrial) {
    let nextCycleItems = await getItemsForNewProduct({
      newProduct,
      attachParams,
      now,
      logger,
    });

    dueNextCycle = {
      line_items: nextCycleItems,
      due_at:
        freeTrialToStripeTimestamp({
          freeTrial,
          now,
        })! * 1000,
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
