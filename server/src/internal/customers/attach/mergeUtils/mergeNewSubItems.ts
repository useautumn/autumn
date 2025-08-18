import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import Stripe from "stripe";

export const mergeNewSubItems = ({
  itemSet,
  curSubItems,
}: {
  itemSet: ItemSet;
  curSubItems: Stripe.SubscriptionItem[];
}) => {
  // 1. Don't need to add arrear prices if they already exist...
  let newSubItems = structuredClone(itemSet.subItems);
  const newArrearSubItems: any[] = [];

  newSubItems = newSubItems.filter((newSi) => {
    const existingItem = curSubItems.find((si) => si.price?.id === newSi.price);
    if (isArrearPrice({ price: newSi.autumnPrice }) && existingItem) {
      newArrearSubItems.push(newSi);
      return false;
    }
    return true;
  });

  // 2. Add new subItems
  for (let i = 0; i < newSubItems.length; i++) {
    const newItem = newSubItems[i];
    const existingItem = curSubItems.find(
      (si) => si.price?.id === newItem.price
    );

    if (!existingItem) continue;

    newSubItems[i] = {
      id: existingItem.id,
      quantity: (existingItem.quantity || 0) + (newItem.quantity || 0),
      // price: newItem.price,
      // autumnPrice: newItem.autumnPrice,
    };
  }

  return newSubItems;
};
