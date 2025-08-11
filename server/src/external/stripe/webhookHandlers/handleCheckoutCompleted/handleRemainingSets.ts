import Stripe from "stripe";
import { createStripeSub } from "../../stripeSubUtils/createStripeSub.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { findPriceFromStripeId } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { APIVersion, BillingType, Organization } from "@autumn/shared";
import { getArrearItems } from "../../stripeSubUtils/getStripeSubItems/getArrearItems.js";

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

  let subs: Stripe.Subscription[] = [];
  let invoiceIds: string[] = [checkoutSession.invoice as string];

  if (checkoutSub) {
    subs.push(checkoutSub);
  }

  if (!remainingSets || remainingSets.length == 0 || !checkoutSub) {
    return {
      subs,
      invoiceIds,
    };
  }

  const firstSetStart = checkoutSub?.current_period_end;

  for (const itemSet of remainingSets) {
    const filteredItems = filterUsagePrices({
      itemSet,
      attachParams,
    });

    itemSet.items = filteredItems;

    const subscription = (await createStripeSub({
      db,
      stripeCli,
      customer: attachParams.customer,
      org,
      itemSet,
      freeTrial: attachParams.freeTrial, // add free trial to subscription...
      anchorToUnix: firstSetStart * 1000,
    })) as Stripe.Subscription;

    subs.push(subscription);
    invoiceIds.push(subscription.latest_invoice as string);
  }

  return {
    subs,
    invoiceIds,
  };
};
