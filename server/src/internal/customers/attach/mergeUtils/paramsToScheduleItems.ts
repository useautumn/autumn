import Stripe from "stripe";
import { mergeNewScheduleItems } from "./mergeNewSubItems.js";
import { getCusProductsToRemove } from "./paramsToSubItems.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  priceToScheduleItem,
  scheduleItemInCusProduct,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";

export const removeCusProductFromScheduleItems = ({
  curScheduleItems,
  updateScheduleItems,
  allCusProducts,
  cusProduct,
  itemSet,
}: {
  curScheduleItems: Stripe.SubscriptionSchedule.Phase.Item[];
  updateScheduleItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[];
  allCusProducts: FullCusProduct[];
  cusProduct: FullCusProduct;
  itemSet?: ItemSet;
}) => {
  const prices = cusProductToPrices({ cusProduct });
  let newScheduleItems = structuredClone(updateScheduleItems);

  const removePriceIds: string[] = [];
  for (const price of prices) {
    const existingScheduleItem = priceToScheduleItem({
      price,
      scheduleItems: curScheduleItems,
      stripeProdId: cusProduct.product.processor?.id,
    });

    if (!existingScheduleItem) continue;

    // 1. If arrear price
    if (isArrearPrice({ price })) {
      if (
        allCusProducts.some((cp) => {
          if (cp.id === cusProduct.id) return false;

          if (cp.canceled) return false;

          if (
            scheduleItemInCusProduct({
              cusProduct: cp,
              scheduleItem: existingScheduleItem as any,
            })
          ) {
            return true;
          }
          return false;
        })
      ) {
        continue;
      }

      if (
        itemSet?.subItems.some(
          (si) => si.price == (existingScheduleItem.price as Stripe.Price)?.id
        )
      ) {
        continue;
      }

      removePriceIds.push((existingScheduleItem.price as Stripe.Price).id);

      continue;
    }

    // 1. Get quantity to remove
    const quantityToRemove = 1;

    // 2. Check if item already exists in newSubItems
    const existingItemIndex = newScheduleItems.findIndex(
      (si) => si.price === (existingScheduleItem.price as Stripe.Price)?.id
    );

    if (existingItemIndex !== -1) {
      // Update existing item in newSubItems
      const currentQuantity = newScheduleItems[existingItemIndex].quantity || 0;
      const newQuantity = currentQuantity - quantityToRemove;

      if (newQuantity <= 0) {
        removePriceIds.push(
          newScheduleItems[existingItemIndex].price as string
        );
      }

      newScheduleItems[existingItemIndex].quantity = newQuantity;
    }
  }

  newScheduleItems = newScheduleItems.filter(
    (si) => !removePriceIds.includes(si.price as string)
  );

  return newScheduleItems;
};

export const paramsToScheduleItems = async ({
  req,
  sub,
  schedule,
  attachParams,
  config,
  removeCusProducts,
}: {
  req: ExtendedRequest;
  sub?: Stripe.Subscription;
  schedule?: Stripe.SubscriptionSchedule;
  attachParams: AttachParams;
  config: AttachConfig;
  removeCusProducts?: FullCusProduct[];
}) => {
  const { logger } = req;

  // Renew flow
  // - Add curCusProduct to schedule items
  // - Remove curScheduledProduct from schedule items

  // Cancel flow
  // -

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  let curScheduleItems: any[] = [];
  if (sub) {
    curScheduleItems = structuredClone(sub.items.data || []);
  } else if (schedule && schedule.phases.length > 1) {
    curScheduleItems = structuredClone(schedule.phases[1].items || []);
  }

  let newScheduleItems: any[] = mergeNewScheduleItems({
    itemSet,
    curScheduleItems,
  });

  let cusProductsToRemove =
    removeCusProducts || getCusProductsToRemove({ attachParams });

  const allCusProducts = attachParams.customer.customer_products;

  for (const cusProduct of cusProductsToRemove) {
    newScheduleItems = removeCusProductFromScheduleItems({
      curScheduleItems,
      updateScheduleItems: newScheduleItems,
      allCusProducts,
      cusProduct,
      itemSet,
    });
  }

  return {
    items: newScheduleItems,
    invoiceItems: itemSet.invoiceItems,
    usageFeatures: itemSet.usageFeatures,
  };

  // // console.log("Price:", formatPrice({ price }));
  // // console.log("Existing schedule item:", existingScheduleItem.price?.id);

  // const removePriceIds: string[] = [];
  // for (const cusProduct of cusProductsToRemove) {
  //   const prices = cusProductToPrices({ cusProduct });

  //   for (const price of prices) {
  //     const existingScheduleItem = priceToScheduleItem({
  //       price,
  //       scheduleItems: curScheduleItems,
  //       stripeProdId: cusProduct.product.processor?.id,
  //     });

  //     if (!existingScheduleItem) continue;

  //     // 1. If arrear price
  //     if (isArrearPrice({ price })) {
  //       if (
  //         allCusProducts.some((cp) => {
  //           if (cp.id === cusProduct.id) return false;

  //           if (cp.canceled) return false;

  //           return scheduleItemInCusProduct({
  //             cusProduct: cp,
  //             scheduleItem: existingScheduleItem as any,
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

  //       removePriceIds.push((existingScheduleItem.price as Stripe.Price).id);

  //       continue;
  //     }

  //     // 1. Get quantity to remove
  //     const quantityToRemove = 1;

  //     // 2. Check if item already exists in newSubItems
  //     const existingItemIndex = newScheduleItems.findIndex(
  //       (si) => si.price === (existingScheduleItem.price as Stripe.Price)?.id
  //     );

  //     if (existingItemIndex !== -1) {
  //       // Update existing item in newSubItems
  //       const currentQuantity =
  //         newScheduleItems[existingItemIndex].quantity || 0;
  //       const newQuantity = currentQuantity - quantityToRemove;

  //       if (newQuantity <= 0) {
  //         removePriceIds.push(
  //           newScheduleItems[existingItemIndex].price as string
  //         );
  //       }

  //       newScheduleItems[existingItemIndex].quantity = newQuantity;
  //     }
  //   }
  // }

  // newScheduleItems = newScheduleItems.filter(
  //   (si) => !removePriceIds.includes(si.price as string)
  // );

  // return {
  //   items: newScheduleItems,
  //   invoiceItems: itemSet.invoiceItems,
  //   usageFeatures: itemSet.usageFeatures,
  // };
};
