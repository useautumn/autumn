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
  subItemInCusProduct,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { mergeNewSubItems } from "./mergeNewSubItems.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";

export const getCusProductsToRemove = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const products = attachParams.products;
  const cusProducts = attachParams.cusProducts;

  const cusProductsToRemove: FullCusProduct[] = [];
  for (const product of products) {
    // Get cur main and cur same
    const { curMainProduct, curSameProduct } = getExistingCusProducts({
      product,
      cusProducts: attachParams.cusProducts,
      internalEntityId: attachParams.internalEntityId,
    });

    // 1. If product is an add on, and there's current same, add it
    if (product.is_add_on && curSameProduct) {
      cusProductsToRemove.push(curSameProduct);
    }

    // 2. If product is a main product, add curMain
    if (curMainProduct) {
      cusProductsToRemove.push(curMainProduct);
    }
  }

  // Get unique cus products, by cusProduct.id
  const uniqueCusProductsToRemove = cusProductsToRemove.filter(
    (cusProduct, index, array) =>
      array.findIndex((cp) => cp.id === cusProduct.id) === index
  );

  return uniqueCusProductsToRemove;
};

export const paramsToSubItems = async ({
  req,
  sub,
  attachParams,
  config,
  onlyPriceItems = false,
}: {
  req: ExtendedRequest;
  sub?: Stripe.Subscription;
  attachParams: AttachParams;
  config: AttachConfig;
  onlyPriceItems?: boolean;
}) => {
  const { logger } = req;
  let curSubItems = sub?.items.data || [];
  // if (scheduleSet) {
  //   const scheduleItems = scheduleSet.schedule.phases[0].items.map((item) => ({
  //     id: item.price,
  //     price: {
  //       id: item.price,
  //     },
  //     quantity: item.quantity,
  //   }));

  //   curSubItems = scheduleItems as any;
  // }

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  // 1. Remove items related to cur cus product...
  const cusProductsToRemove = getCusProductsToRemove({ attachParams });

  let newSubItems = mergeNewSubItems({
    itemSet,
    curSubItems,
  });

  const allCusProducts = attachParams.customer.customer_products;

  // 3. Remove items related to cus products to remove
  for (const cusProduct of cusProductsToRemove) {
    const prices = cusProductToPrices({ cusProduct });

    for (const price of prices) {
      const existingSubItem = findStripeItemForPrice({
        price,
        stripeItems: curSubItems,
        stripeProdId: cusProduct.product.processor?.id,
      });

      if (!existingSubItem) continue;

      // 1. If arrear price
      if (isArrearPrice({ price })) {
        if (
          allCusProducts.some((cp) => {
            if (cp.id === cusProduct.id) return false;

            return subItemInCusProduct({
              cusProduct: cp,
              subItem: existingSubItem as Stripe.SubscriptionItem,
            });
          })
        ) {
          continue;
        }

        if (
          itemSet.subItems.some((si) => si.price == existingSubItem.price?.id)
        ) {
          continue;
        }

        newSubItems.push({
          id: existingSubItem.id,
          deleted: true,
        });

        continue;
      }

      // Helper function to handle quantity updates and deletion
      const updateItemQuantity = (item: any, newQuantity: number) => {
        if (newQuantity <= 0) {
          item.deleted = true;
          item.quantity = undefined;
        } else {
          item.quantity = newQuantity;
        }
      };

      // 1. Get quantity to remove
      const quantityToRemove = 1;

      // 2. Check if item already exists in newSubItems
      const existingItemIndex = newSubItems.findIndex(
        (si) => si.id === existingSubItem.id
      );

      if (existingItemIndex !== -1) {
        const currentQuantity = newSubItems[existingItemIndex].quantity || 0;
        const newQuantity = currentQuantity - quantityToRemove;
        updateItemQuantity(newSubItems[existingItemIndex], newQuantity);
      } else {
        const currentQuantity = existingSubItem.quantity || 0;
        const newQuantity = currentQuantity - quantityToRemove;
        newSubItems.push({
          id: existingSubItem.id,
          quantity: newQuantity,
        });
        updateItemQuantity(newSubItems[newSubItems.length - 1], newQuantity);
      }
    }
  }

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
    subItems: newSubItems,
    invoiceItems: itemSet.invoiceItems,
    usageFeatures: itemSet.usageFeatures,
  };
};
