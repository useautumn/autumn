import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  getLargestInterval,
  intervalsDifferent,
} from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { attachParamsToProduct } from "./convertAttachParams.js";
import { FullCusProduct } from "@autumn/shared";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";

export const getCycleWillReset = ({
  attachParams,
  stripeSubs,
}: {
  attachParams: AttachParams;
  stripeSubs: Stripe.Subscription[];
}) => {
  const product = attachParamsToProduct({ attachParams });
  const firstInterval = getLargestInterval({ prices: product.prices });
  const prevInterval = subToAutumnInterval(stripeSubs[0]);
  return intervalsDifferent({
    intervalA: firstInterval,
    intervalB: prevInterval,
  });
};

export const removeCurCusProductItems = async ({
  sub,
  cusProduct,
  subItems,
}: {
  sub?: Stripe.Subscription | null;
  cusProduct?: FullCusProduct;
  subItems: any[];
}) => {
  if (!sub || !cusProduct) {
    return subItems;
  }

  const newItems: any[] = structuredClone(subItems);
  for (const item of sub.items.data) {
    let shouldRemove = subItemInCusProduct({
      cusProduct,
      subItem: item,
    });

    if (shouldRemove) {
      newItems.push({
        id: item.id,
        deleted: true,
      });
    }
  }

  return newItems;
};
