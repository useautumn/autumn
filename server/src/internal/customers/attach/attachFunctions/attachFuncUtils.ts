import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { FullCusProduct } from "@autumn/shared";
import Stripe from "stripe";

export const addSubItemsToRemove = async ({
  sub,
  cusProduct,
  itemSet,
}: {
  sub?: Stripe.Subscription | null;
  cusProduct: FullCusProduct;
  itemSet: ItemSet;
}) => {
  if (!sub) {
    return;
  }

  for (const item of sub.items.data) {
    let shouldRemove = subItemInCusProduct({
      cusProduct,
      subItem: item,
    });

    if (shouldRemove) {
      itemSet.items.push({
        id: item.id,
        deleted: true,
      });
    }
  }
};
