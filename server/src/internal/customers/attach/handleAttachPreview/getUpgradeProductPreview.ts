import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getFirstInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { getItemsForCurProduct } from "@/internal/invoices/previewItemUtils/getItemsForCurProduct.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import Stripe from "stripe";
import {
  AttachBranch,
  BillingInterval,
  FreeTrial,
  FullCusProduct,
  PreviewLineItem,
  Price,
  UsageModel,
  AttachConfig,
} from "@autumn/shared";
import {
  addBillingIntervalUnix,
  getAlignedIntervalUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { Decimal } from "decimal.js";
import { intervalsAreSame } from "../attachUtils/getAttachConfig.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { formatUnixToDateTime, notNullish } from "@/utils/genUtils.js";

const getNextCycleAt = ({
  prices,
  stripeSubs,
  willCycleReset,
  interval,
  now,
  freeTrial,
  branch,
  curCusProduct,
}: {
  prices: Price[];
  stripeSubs: Stripe.Subscription[];
  willCycleReset: boolean;
  interval: BillingInterval;
  now?: number;
  freeTrial?: FreeTrial | null;
  branch: AttachBranch;
  curCusProduct?: FullCusProduct;
}) => {
  now = now || Date.now();

  if (branch == AttachBranch.NewVersion && curCusProduct?.free_trial) {
    return {
      next_cycle_at: curCusProduct.trial_ends_at,
    };
  }

  if (freeTrial) {
    return {
      next_cycle_at:
        freeTrialToStripeTimestamp({
          freeTrial,
          now,
        })! * 1000,
    };
  }

  if (willCycleReset) {
    const firstInterval = getFirstInterval({ prices });
    return {
      next_cycle_at: addBillingIntervalUnix(now, firstInterval),
    };
  }

  const firstInterval = getFirstInterval({ prices });
  const nextCycleAt = getAlignedIntervalUnix({
    alignWithUnix: stripeSubs[0].current_period_end * 1000,
    interval: firstInterval,
    alwaysReturn: true,
    now,
  });

  return {
    next_cycle_at: nextCycleAt,
  };
};

export const getUpgradeProductPreview = async ({
  req,
  attachParams,
  branch,
  now,
  withPrepaid = false,
  config,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  branch: AttachBranch;
  now: number;
  withPrepaid?: boolean;
  config: AttachConfig;
}) => {
  const { logtail: logger } = req;

  const { stripeCli } = attachParams;

  const { curMainProduct, curSameProduct } = attachParamToCusProducts({
    attachParams,
  });

  const curCusProduct = curSameProduct || curMainProduct!;

  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct?.subscription_ids || [],
    expand: ["items.data.price.tiers"],
  });

  const curPreviewItems = await getItemsForCurProduct({
    stripeSubs,
    attachParams,
    branch,
    config,
    now,
    logger,
  });

  // Get prorated amounts for new product
  const newProduct = attachParamsToProduct({ attachParams });
  const intervalsSame = intervalsAreSame({ attachParams });
  const anchorToUnix =
    intervalsSame && stripeSubs.length > 0
      ? stripeSubs[0].current_period_end * 1000
      : undefined;

  let freeTrial = attachParams.freeTrial;
  if (config?.carryTrial && curCusProduct?.free_trial) {
    freeTrial = curCusProduct.free_trial;
  }

  const newPreviewItems = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now,
    anchorToUnix,
    freeTrial,
    stripeSubs,
    logger,
    withPrepaid,
    branch,
    config,
  });

  const lastInterval = getFirstInterval({ prices: newProduct.prices });

  let dueNextCycle = undefined;
  if (!isFreeProduct(newProduct.prices)) {
    const nextCycleAt = getNextCycleAt({
      prices: newProduct.prices,
      stripeSubs,
      willCycleReset: !intervalsSame,
      interval: lastInterval,
      now,
      freeTrial: attachParams.freeTrial,
      branch,
      curCusProduct,
    });

    let nextCycleItems = await getItemsForNewProduct({
      newProduct,
      attachParams,
      interval: attachParams.freeTrial ? undefined : lastInterval,
      logger,
      withPrepaid,
      branch,
      config,
    });

    dueNextCycle = {
      line_items: nextCycleItems,
      due_at: nextCycleAt.next_cycle_at,
    };
  }

  let items = [...curPreviewItems, ...newPreviewItems];

  for (const item of structuredClone(curPreviewItems)) {
    let priceId = item.price_id;
    let newItem = newPreviewItems.find((i) => i.price_id == priceId);

    if (!newItem) {
      continue;
    }

    let newItemAmount = new Decimal(newItem?.amount ?? 0).toDecimalPlaces(2);
    let curItemAmount = new Decimal(item.amount ?? 0).toDecimalPlaces(2);

    if (newItemAmount.add(curItemAmount).eq(0)) {
      items = items.filter((i) => i.price_id !== priceId);
    }
  }

  const dueTodayAmt = items
    .reduce((acc, item) => acc.plus(item.amount ?? 0), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();

  let options = getOptions({
    prodItems: mapToProductItems({
      prices: newProduct.prices,
      entitlements: newProduct.entitlements,
      features: attachParams.features,
    }),
    features: attachParams.features,
    anchorToUnix,
    now,
    freeTrial: attachParams.freeTrial,
    cusProduct: curCusProduct,
  });

  items = items.filter((item) => item.amount !== 0);

  if (branch == AttachBranch.UpdatePrepaidQuantity) {
    items = items.filter((item) => item.usage_model == UsageModel.Prepaid);
    dueNextCycle!.line_items = dueNextCycle!.line_items.filter(
      (item) => item.usage_model == UsageModel.Prepaid
    );
  }

  let dueToday:
    | {
        line_items: PreviewLineItem[];
        total: number;
      }
    | undefined = {
    line_items: items,
    total: dueTodayAmt,
  };

  if (branch == AttachBranch.SameCustomEnts) {
    dueToday = undefined;
  }

  if (branch == AttachBranch.NewVersion && dueToday) {
    dueToday.line_items = [];
    dueToday.total = 0;
  }

  return {
    currency: attachParams.org.default_currency,
    due_today: dueToday,
    due_next_cycle: dueNextCycle,
    options,
  };
};
