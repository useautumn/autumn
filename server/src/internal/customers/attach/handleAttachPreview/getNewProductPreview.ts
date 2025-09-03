import {
  AttachBranch,
  AttachConfig,
  BillingInterval,
  FullProduct,
  FreeTrial,
} from "@autumn/shared";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  attachParamsToProduct,
  getCustomerSub,
} from "../attachUtils/convertAttachParams.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import {
  addIntervalForProration,
  getAlignedIntervalUnix,
  getNextStartOfMonthUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import {
  getLargestInterval,
  getSmallestInterval,
} from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { isTrialing } from "@autumn/shared";

const getNextCycleItems = async ({
  newProduct,
  attachParams,
  anchorToUnix,
  branch,
  withPrepaid,
  logger,
  config,
  trialEnds,
}: {
  newProduct: FullProduct;
  attachParams: AttachParams;
  anchorToUnix?: number;
  branch: AttachBranch;
  withPrepaid?: boolean;
  logger: any;
  config: AttachConfig;
  trialEnds?: number | null;
}) => {
  // 2. If free trial
  let nextCycleAt = undefined;
  if (attachParams.freeTrial) {
    if (trialEnds) {
      nextCycleAt = trialEnds;
    } else {
      nextCycleAt =
        freeTrialToStripeTimestamp({
          freeTrial: attachParams.freeTrial,
          now: attachParams.now,
        })! * 1000;
    }
  } else if (branch != AttachBranch.OneOff && anchorToUnix) {
    // Yearly one
    const largestInterval = getLargestInterval({ prices: newProduct.prices });
    if (largestInterval) {
      nextCycleAt = getAlignedIntervalUnix({
        alignWithUnix: anchorToUnix,
        interval: largestInterval.interval,
        intervalCount: largestInterval.intervalCount,
        now: attachParams.now,
      });
    }
  }

  const items = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now: attachParams.now,
    logger,
    withPrepaid,
    branch,
    config,
  });

  return {
    line_items: items,
    due_at: nextCycleAt,
  };
};

export const getNewProductPreview = async ({
  branch,
  attachParams,
  logger,
  config,
  withPrepaid = false,
}: {
  branch: AttachBranch;
  attachParams: AttachParams;
  logger: any;
  config: AttachConfig;
  withPrepaid?: boolean;
}) => {
  const { org } = attachParams;
  const newProduct = attachParamsToProduct({ attachParams });

  let anchorToUnix = undefined;
  if (org.config.anchor_start_of_month) {
    anchorToUnix = getNextStartOfMonthUnix({
      interval: BillingInterval.Month,
      intervalCount: 1,
    });
  }

  // const { mergeSub } = await getMergeCusProduct({
  //   attachParams,
  //   products: [newProduct],
  //   config,
  // });
  const { sub: mergeSub, cusProduct: mergeCusProduct } = await getCustomerSub({
    attachParams,
  });

  // console.log("Merge sub:", mergeSub?.id);
  // console.log("Merge cus product:", mergeCusProduct?.product.id);
  // console.log(
  //   "Trial ends at:",
  //   formatUnixToDate(mergeCusProduct?.trial_ends_at || 0)
  // );

  let trialEnds = undefined;
  if (mergeSub && branch !== AttachBranch.MainIsTrial) {
    const { start } = subToPeriodStartEnd({ sub: mergeSub });
    if (mergeCusProduct?.free_trial) {
      // 1. If still on trial
      if (isTrialing({ cusProduct: mergeCusProduct, now: attachParams.now })) {
        trialEnds = mergeCusProduct.trial_ends_at;
        attachParams.freeTrial = mergeCusProduct.free_trial;
      } else {
        attachParams.freeTrial = null;
      }
    }

    const smallestInterval = getSmallestInterval({
      prices: newProduct.prices,
      excludeOneOff: true,
    });

    if (smallestInterval) {
      anchorToUnix = addIntervalForProration({
        unixTimestamp: start * 1000,
        intervalConfig: smallestInterval,
      });
    }
  }

  const items = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now: attachParams.now,
    freeTrial: attachParams.freeTrial,
    anchorToUnix,
    logger,
    withPrepaid,
    branch,
    config,
  });

  // let dueNextCycle = null;
  const dueNextCycle = await getNextCycleItems({
    newProduct,
    attachParams,
    anchorToUnix,
    branch,
    withPrepaid,
    logger,
    config,
    trialEnds,
  });

  // console.log("Due next cycle", dueNextCycle);

  // Show next cycle if free trial or notNullish(anchorToUnix) or branch != one off?

  // if (
  //   (freeTrial || notNullish(anchorToUnix)) &&
  //   branch != AttachBranch.OneOff
  // ) {
  //   let nextCycleItems = await getItemsForNewProduct({
  //     newProduct,
  //     attachParams,
  //     now: attachParams.now,
  //     logger,
  //     withPrepaid,
  //     branch,
  //     config,
  //   });

  //   // let minInterval = getLastInterval({
  //   //   prices: newProduct.prices,
  //   //   ents: newProduct.entitlements,
  //   // });
  //   let min = getSmallestInterval({
  //     prices: newProduct.prices,
  //     ents: newProduct.entitlements,
  //   });

  //   let getAligned = notNullish(anchorToUnix) && notNullish(min);

  //   let dueAt = freeTrial
  //     ? freeTrialToStripeTimestamp({
  //         freeTrial,
  //         now: attachParams.now,
  //       })! * 1000
  //     : getAligned
  //       ? getAlignedIntervalUnix({
  //           alignWithUnix: anchorToUnix!,
  //           interval: min!.interval,
  //           intervalCount: min!.intervalCount,
  //           now: attachParams.now,
  //         })
  //       : notNullish(min)
  //         ? addBillingIntervalUnix({
  //             unixTimestamp: attachParams.now || Date.now(),
  //             interval: min!.interval,
  //             intervalCount: min!.intervalCount,
  //           })
  //         : undefined;

  //   dueNextCycle = !nullish(dueAt)
  //     ? {
  //         line_items: nextCycleItems,
  //         due_at: dueAt,
  //       }
  //     : undefined;
  // }

  let options = getOptions({
    prodItems: mapToProductItems({
      prices: newProduct.prices,
      entitlements: newProduct.entitlements,
      features: attachParams.features,
    }),
    features: attachParams.features,
    anchorToUnix,
    now: attachParams.now || Date.now(),
    freeTrial: attachParams.freeTrial,
  });

  const dueTodayAmt = items.reduce((acc, item) => {
    return acc + (item.amount ?? 0);
  }, 0);

  // // Next cycle at
  // if (!dueNextCycle) {
  //   if (!isFreeProduct(newProduct.prices) && branch != AttachBranch.OneOff) {
  //     let min = getSmallestInterval({
  //       prices: newProduct.prices,
  //       ents: newProduct.entitlements,
  //     });
  //     dueNextCycle = {
  //       line_items: items.filter((item) => {
  //         let price = newProduct.prices.find(
  //           (price) => price.id == item.price_id
  //         );
  //         return (
  //           price?.config.interval == min!.interval &&
  //           (price?.config.interval_count || 1) == (min!.intervalCount || 1)
  //         );
  //       }),
  //       due_at: addBillingIntervalUnix({
  //         unixTimestamp: attachParams.now || Date.now(),
  //         interval: min!.interval,
  //         intervalCount: min!.intervalCount,
  //       }),
  //     };
  //   }
  // }

  return {
    currency: attachParams.org.default_currency,
    due_today: {
      line_items: items,
      total: dueTodayAmt,
    },
    due_next_cycle: dueNextCycle,
    free_trial: attachParams.freeTrial,
    options,
  };
};
