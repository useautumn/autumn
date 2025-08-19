import Stripe from "stripe";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  findStripeItemForPrice,
  priceToScheduleItem,
  scheduleItemInCusProduct,
  scheduleToSubItem,
  subItemInCusProduct,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { mergeNewScheduleItems, mergeNewSubItems } from "./mergeNewSubItems.js";
import { getCusProductsToRemove } from "./paramsToSubItems.js";

export const paramsToScheduleItems = async ({
  req,
  sub,
  scheduleSet,
  attachParams,
  config,
  onlyPriceItems = false,
}: {
  req: ExtendedRequest;
  sub?: Stripe.Subscription;
  scheduleSet?: {
    schedule: Stripe.SubscriptionSchedule;
    prices: Stripe.Price[];
  };
  attachParams: AttachParams;
  config: AttachConfig;
  onlyPriceItems?: boolean;
}) => {
  const { logger } = req;
  const curScheduleItems = scheduleSet?.schedule.phases[0].items || [];

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  const newScheduleItems = mergeNewScheduleItems({
    itemSet,
    curScheduleItems,
  });

  const cusProductsToRemove = getCusProductsToRemove({ attachParams });
  const allCusProducts = attachParams.customer.customer_products;

  // for (const cusProduct of cusProductsToRemove) {
  //   const prices = cusProductToPrices({ cusProduct });

  //   for (const price of prices) {
  //     const existingScheduleItem = priceToScheduleItem({
  //       price,
  //       scheduleItems: newScheduleItems as any,
  //       stripeProdId: cusProduct.product.processor?.id,
  //       prices: scheduleSet?.prices || [],
  //     });

  //     if (!existingScheduleItem) continue;

  //     // 1. If arrear price
  //     if (isArrearPrice({ price })) {
  //       if (
  //         allCusProducts.some((cp) => {
  //           if (cp.id === cusProduct.id) return false;

  //           return scheduleItemInCusProduct({
  //             cusProduct: cp,
  //             scheduleItem: existingScheduleItem as any,
  //             prices: scheduleSet?.prices || [],
  //           });
  //         })
  //       ) {
  //         continue;
  //       }

  //       if (
  //         itemSet.subItems.some((si) => si.price == existingScheduleItem.price)
  //       ) {
  //         continue;
  //       }

  //       newSubItems.push({
  //         id: existingSubItem.id,
  //         deleted: true,
  //       });

  //       continue;
  //     }

  //     // Helper function to handle quantity updates and deletion
  //     const updateItemQuantity = (item: any, newQuantity: number) => {
  //       if (newQuantity <= 0) {
  //         item.deleted = true;
  //         item.quantity = undefined;
  //       } else {
  //         item.quantity = newQuantity;
  //       }
  //     };

  //     // 1. Get quantity to remove
  //     const quantityToRemove = 1;

  //     // 2. Check if item already exists in newSubItems
  //     const existingItemIndex = newSubItems.findIndex(
  //       (si) => si.id === existingSubItem.id
  //     );

  //     if (existingItemIndex !== -1) {
  //       // Update existing item in newSubItems
  //       const currentQuantity = newSubItems[existingItemIndex].quantity || 0;
  //       const newQuantity = currentQuantity - quantityToRemove;
  //       updateItemQuantity(newSubItems[existingItemIndex], newQuantity);
  //     } else {
  //       // Add new item to newSubItems
  //       const currentQuantity = existingSubItem.quantity || 0;
  //       const newQuantity = currentQuantity - quantityToRemove;
  //       newSubItems.push({
  //         id: existingSubItem.id,
  //         quantity: newQuantity,
  //       });
  //       updateItemQuantity(newSubItems[newSubItems.length - 1], newQuantity);
  //     }
  //   }
  // }

  // if (onlyPriceItems) {
  //   newSubItems = newSubItems.map((si) => {
  //     if (si.id) {
  //       const { id, ...rest } = si;
  //       const existingSubItem = curSubItems.find((csi) => csi.id === si.id);
  //       if (existingSubItem) {
  //         return {
  //           price: existingSubItem.price?.id,
  //           ...rest,
  //         };
  //       }
  //     }
  //     return si;
  //   });
  // }

  return {
    // subItems: newSubItems,
    invoiceItems: itemSet.invoiceItems,
    usageFeatures: itemSet.usageFeatures,
  };
};
