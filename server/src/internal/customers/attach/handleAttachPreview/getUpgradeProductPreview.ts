import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getLastInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { getItemsForCurProduct } from "@/internal/invoices/previewItemUtils/getItemsForCurProduct.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import Stripe from "stripe";
import {
  AttachBranch,
  BillingInterval,
  FreeTrial,
  PreviewLineItem,
  Price,
  UsageModel,
} from "@autumn/shared";
import {
  addBillingIntervalUnix,
  getAlignedIntervalUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { Decimal } from "decimal.js";
import { intervalsAreSame } from "../attachUtils/getAttachConfig.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { notNullish } from "@/utils/genUtils.js";

const getNextCycleAt = ({
  prices,
  stripeSubs,
  willCycleReset,
  interval,
  now,
  freeTrial,
}: {
  prices: Price[];
  stripeSubs: Stripe.Subscription[];
  willCycleReset: boolean;
  interval: BillingInterval;
  now?: number;
  freeTrial?: FreeTrial | null;
}) => {
  now = now || Date.now();

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
    const minInterval = getLastInterval({ prices });
    return {
      next_cycle_at: addBillingIntervalUnix(now, minInterval),
    };
  }

  const minInterval = getLastInterval({ prices });
  const nextCycleAt = getAlignedIntervalUnix({
    alignWithUnix: stripeSubs[0].current_period_end * 1000,
    interval: minInterval,
    alwaysReturn: true,
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
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  branch: AttachBranch;
  now: number;
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

  const newPreviewItems = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now,
    anchorToUnix,
    freeTrial: attachParams.freeTrial,
    stripeSubs,
    logger,
  });

  const lastInterval = getLastInterval({ prices: newProduct.prices });

  let dueNextCycle = undefined;
  if (!isFreeProduct(newProduct.prices)) {
    const nextCycleAt = getNextCycleAt({
      prices: newProduct.prices,
      stripeSubs,
      willCycleReset: !intervalsSame,
      interval: lastInterval,
      now,
      freeTrial: attachParams.freeTrial,
    });

    let nextCycleItems = await getItemsForNewProduct({
      newProduct,
      attachParams,
      interval: attachParams.freeTrial ? undefined : lastInterval,
      logger,
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
      (item) => item.usage_model == UsageModel.Prepaid,
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

  return {
    currency: attachParams.org.default_currency,
    due_today: dueToday,
    due_next_cycle: dueNextCycle,
    options,
  };
};
