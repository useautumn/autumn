import Stripe from "stripe";
import { createStripeSub } from "../../stripeSubUtils/createStripeSub.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { findPriceFromStripeId } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import {
  APIVersion,
  BillingType,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { getArrearItems } from "../../stripeSubUtils/getStripeSubItems/getArrearItems.js";
import { isUsagePrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getEmptyPriceItem } from "../../priceToStripeItem/priceToStripeItem.js";

const filterUsagePrices = ({
  itemSet,
  attachParams,
}: {
  itemSet: ItemSet;
  attachParams: AttachParams;
}) => {
  const { internalEntityId, apiVersion } = attachParams;
  const filteredItems = itemSet.items.filter((item: any) => {
    let price = findPriceFromStripeId({
      prices: attachParams.prices,
      stripePriceId: item.price,
      billingType: BillingType.UsageInArrear,
    });

    if (!price) {
      return true;
    }

    if (apiVersion == APIVersion.v1_4 || notNullish(internalEntityId)) {
      return false;
    }

    return true;
  });

  if (filteredItems.length == 0) {
    return getArrearItems({
      prices: attachParams.prices,
      interval: itemSet.interval,
      org: attachParams.org,
      intervalCount: itemSet.intervalCount,
    });
  }

  return filteredItems;
};

export const handleRemainingSets = async ({
  stripeCli,
  db,
  org,
  checkoutSession,
  attachParams,
  checkoutSub,
  logger,
}: {
  stripeCli: Stripe;
  db: DrizzleCli;
  org: Organization;
  checkoutSession: Stripe.Checkout.Session;
  attachParams: AttachParams;
  checkoutSub: Stripe.Subscription | null;
  logger: any;
}) => {
  const itemSets = attachParams.itemSets;
  let remainingSets = itemSets ? itemSets.slice(1) : [];

  const remainingItems = remainingSets.flatMap((set) => set.items);
  let invoiceIds: string[] = [checkoutSession.invoice as string];

  // Replace items with empty price if needed...
  for (const price of attachParams.prices) {
    if (!isUsagePrice({ price })) continue;

    const config = price.config as UsagePriceConfig;
    const emptyPrice = config.stripe_empty_price_id;

    if (
      attachParams.internalEntityId ||
      attachParams.apiVersion == APIVersion.v1_4
    ) {
      const replaceIndex = remainingItems.findIndex(
        (item) => item.price == config.stripe_price_id
      );

      if (replaceIndex != -1) {
        remainingItems[replaceIndex] = emptyPrice
          ? {
              price: config.stripe_empty_price_id,
              quantity: 0,
            }
          : (getEmptyPriceItem({ price, org }) as any);
      }
    }
  }

  if (remainingItems.length > 0) {
    await stripeCli.subscriptions.update(checkoutSub!.id, {
      items: remainingItems,
    });
  }

  return { invoiceIds };
};
