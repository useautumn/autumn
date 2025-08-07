import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  APIVersion,
  BillingType,
  CusProductStatus,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import Stripe from "stripe";
import { AppEnv } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { constructSub } from "@/internal/subscriptions/subUtils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  findPriceFromPlaceholderId,
  findPriceFromStripeId,
} from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { getArrearItems } from "../../stripeSubUtils/getStripeSubItems/getArrearItems.js";

export const handleCheckoutSub = async ({
  stripeCli,
  db,
  subscription,
  attachParams,
  logger,
}: {
  stripeCli: Stripe;
  db: DrizzleCli;
  subscription: Stripe.Subscription | null;
  attachParams: AttachParams;
  logger: any;
}) => {
  const { org, customer } = attachParams;

  if (!subscription) {
    return;
  }

  await SubService.createSub({
    db,
    sub: constructSub({
      stripeId: subscription.id,
      usageFeatures: attachParams.itemSets?.[0]?.usageFeatures || [],
      orgId: org.id,
      env: attachParams.customer.env,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
    }),
  });

  const curSubItems = subscription.items.data;
  let itemsUpdate = [];

  for (const item of curSubItems) {
    let stripePriceId = item.price.id;

    let arrearProratedPrice = findPriceFromPlaceholderId({
      prices: attachParams.prices,
      placeholderId: stripePriceId,
    });

    if (arrearProratedPrice) {
      itemsUpdate.push({
        price: arrearProratedPrice.config.stripe_price_id!,
        quantity: 0,
      });

      itemsUpdate.push({
        id: item.id,
        deleted: true,
      });
      continue;
    }

    let arrearPrice = findPriceFromStripeId({
      prices: attachParams.prices,
      stripePriceId,
      billingType: BillingType.UsageInArrear,
    });

    if (
      arrearPrice &&
      (attachParams.internalEntityId ||
        attachParams.apiVersion == APIVersion.v1_4)
    ) {
      itemsUpdate.push({
        id: item.id,
        deleted: true,
      });
    }
  }

  let deletedCount = itemsUpdate.filter((item) => item.deleted).length;
  if (deletedCount === curSubItems.length) {
    itemsUpdate = itemsUpdate.concat(
      getArrearItems({
        prices: attachParams.prices,
        interval: attachParams.itemSets?.[0]?.interval,
        intervalCount: attachParams.itemSets?.[0]?.intervalCount,
        org,
      })
    );
  }

  if (itemsUpdate.length > 0) {
    await stripeCli.subscriptions.update(subscription.id, {
      items: itemsUpdate,
    });
  }

  // for (const item of subscription.items.data) {
  //   let stripePriceId = item.price.id;

  //   let arrearProratedPrice = findPriceFromPlaceholderId({
  //     prices: attachParams.prices,
  //     placeholderId: stripePriceId,
  //   });

  //   if (arrearProratedPrice) {
  //     let config = arrearProratedPrice.config as UsagePriceConfig;
  //     await stripeCli.subscriptionItems.update(item.id, {
  //       price: config.stripe_price_id!,
  //       quantity: 0,
  //     });
  //     continue;
  //   }

  //   let arrearPrice = findPriceFromStripeId({
  //     prices: attachParams.prices,
  //     stripePriceId,
  //     billingType: BillingType.UsageInArrear,
  //   });

  //   if (
  //     arrearPrice &&
  //     (attachParams.internalEntityId ||
  //       attachParams.apiVersion == APIVersion.v1_4)
  //   ) {
  //     await stripeCli.subscriptionItems.del(item.id);
  //     continue;
  //   }
  // }

  return subscription;
};
