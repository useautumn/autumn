import Stripe from "stripe";
import { mergeNewScheduleItems } from "./mergeNewSubItems.js";
import { getCusProductsToRemove } from "./paramsToSubItems.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { cusProductToPrices } from "@autumn/shared";
import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  priceToScheduleItem,
  scheduleItemInCusProduct,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";
import { differenceInDays } from "date-fns";
import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { mergeAdjacentPhasesWithSameItems } from "./phaseUtils/mergeSimilarPhases.js";
import { preparePhasesForBillingPeriod } from "./phaseUtils/upsertNewPhase.js";
import { getQuantityToRemove } from "./mergeUtils.js";

export const removeCusProductFromScheduleItems = async ({
  curScheduleItems,
  updateScheduleItems,
  allCusProducts,
  cusProduct,
  itemSet,
  phaseStart,
  attachParams,
}: {
  curScheduleItems: Stripe.SubscriptionSchedule.Phase.Item[];
  updateScheduleItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[];
  allCusProducts: FullCusProduct[];
  cusProduct: FullCusProduct;
  itemSet?: ItemSet;
  phaseStart?: number;
  attachParams: AttachParams;
}) => {
  const prices = cusProductToPrices({ cusProduct });
  let newScheduleItems = structuredClone(updateScheduleItems);

  const removePriceIds: string[] = [];

  const printRemoveLogs = false;
  for (const price of prices) {
    const existingScheduleItem = priceToScheduleItem({
      price,
      scheduleItems: curScheduleItems,
      stripeProdId: cusProduct.product.processor?.id,
    });

    if (printRemoveLogs) {
      console.log(
        "Removing price: ",
        `${cusProduct.product.name} - ${formatPrice({ price })},`
      );
      console.log(
        "Existing schedule item:",
        (existingScheduleItem?.price as Stripe.Price)?.id
      );
      console.log("---");
    }

    if (!existingScheduleItem) continue;

    // 1. If arrear price
    if (isArrearPrice({ price })) {
      if (
        allCusProducts.some((cp) => {
          if (cp.id === cusProduct.id) return false;
          if (cp.canceled) return false;

          if (
            phaseStart &&
            differenceInDays(cusProduct.starts_at, phaseStart * 1000) > 1
          )
            return false;

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
    // Get quantity from cus product...
    const quantityToRemove = getQuantityToRemove({
      cusProduct,
      price,
      entities: attachParams.customer.entities,
    });

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

const logScheduleItems = ({
  items,
  cusProducts,
}: {
  items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[];
  cusProducts: FullCusProduct[];
}) => {
  for (const item of items) {
    let matchedPrice = null;
    let matchedCusProduct = null;
    for (const cusProduct of cusProducts) {
      const prices = cusProductToPrices({ cusProduct });
      const price = prices.find((p) => {
        return p.config.stripe_price_id == item.price;
      });

      if (price) {
        matchedPrice = price;
        matchedCusProduct = cusProduct;
      }
    }
    console.log({
      priceStr: matchedPrice
        ? `${matchedCusProduct?.product.name} - ${formatPrice({
            price: matchedPrice,
          })}`
        : "N/A",
      price: item.price,
      quantity: item.quantity,
    });
  }

  console.log("--------------------------------");
};

// Helper: merge new items and then remove items from selected customer products
const computeUpdatedScheduleItems = async ({
  itemSet,
  baseCurScheduleItems,
  attachParams,
  removeCusProducts,
  phaseStart,
}: {
  itemSet: ItemSet;
  baseCurScheduleItems: Stripe.SubscriptionSchedule.Phase.Item[];
  attachParams: AttachParams;
  removeCusProducts?: FullCusProduct[];
  phaseStart?: number;
}): Promise<Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]> => {
  let newScheduleItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] =
    mergeNewScheduleItems({
      itemSet,
      curScheduleItems: baseCurScheduleItems,
    });

  const cusProductsToRemove =
    removeCusProducts ||
    getCusProductsToRemove({ attachParams, includeScheduled: true });

  // console.log(
  //   "REMOVING CUS PRODUCTS:",
  //   cusProductsToRemove?.map((cp) => `${cp.product.id} (E: ${cp.entity_id})`)
  // );

  const allCusProducts = attachParams.customer.customer_products;

  // console.log("New schedule items:");
  // logScheduleItems({ items: newScheduleItems, cusProducts: allCusProducts });
  for (const cusProduct of cusProductsToRemove) {
    newScheduleItems = await removeCusProductFromScheduleItems({
      curScheduleItems: baseCurScheduleItems,
      updateScheduleItems: newScheduleItems,
      allCusProducts,
      cusProduct,
      itemSet,
      phaseStart,
      attachParams,
    });
  }

  // console.log("New schedule items after removing cus products:");
  // logScheduleItems({ items: newScheduleItems, cusProducts: allCusProducts });

  return newScheduleItems;
};

export const paramsToScheduleItems = async ({
  req,
  sub,
  schedule,
  attachParams,
  config,
  removeCusProducts,
  billingPeriodEnd,
}: {
  req: ExtendedRequest;
  sub?: Stripe.Subscription;
  schedule?: Stripe.SubscriptionSchedule;
  attachParams: AttachParams;
  config: AttachConfig;
  removeCusProducts?: FullCusProduct[];
  billingPeriodEnd?: number;
}) => {
  const { logger } = req;

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  let curScheduleItems: any[] = [];
  let phaseIndex = -1;

  if (billingPeriodEnd && schedule && schedule.phases.length > 1) {
    phaseIndex = schedule.phases.findIndex(
      (phase) => billingPeriodEnd <= phase.start_date
    );
  }

  const printPhaseLogs = false;
  if (printPhaseLogs) {
    console.log("Phase index:", phaseIndex);
    console.log(
      "Billing period end:",
      formatUnixToDateTime(billingPeriodEnd! * 1000)
    );
    console.log(
      "Phases:",
      schedule?.phases.map((p) => ({
        start_date: formatUnixToDateTime(p.start_date * 1000),
        end_date: formatUnixToDateTime(p.end_date * 1000),
      }))
    );
  }

  if (phaseIndex === -1) {
    let curScheduleItems = [];

    if (sub) {
      curScheduleItems = structuredClone(sub?.items.data || []);
    } else {
      curScheduleItems = schedule!.phases[schedule!.phases.length - 1].items;
    }

    const newScheduleItems = await computeUpdatedScheduleItems({
      itemSet,
      baseCurScheduleItems: curScheduleItems as any,
      attachParams,
      removeCusProducts,
    });

    const curPhases = schedule?.phases || [];
    const mappedExistingPhases = curPhases.map((phase, index) => {
      const items = phase.items.map((item) => ({
        price: (item.price as Stripe.Price).id,
        quantity: item.quantity,
        trial_end: phase.trial_end || undefined,
      }));
      const isLast = index === schedule!.phases.length - 1;
      const end_date = isLast ? billingPeriodEnd : phase.end_date;
      return { items, start_date: phase.start_date, end_date };
    });

    const appendedPhase = {
      items: newScheduleItems,
      start_date: billingPeriodEnd,
    };

    const finalPhases = mergeAdjacentPhasesWithSameItems([
      ...mappedExistingPhases,
      appendedPhase,
    ] as any);

    return {
      items: newScheduleItems,
      phases: finalPhases,
      invoiceItems: itemSet.invoiceItems,
      usageFeatures: itemSet.usageFeatures,
    };
  } else {
    const {
      phases: newPhases,
      insertIndex,
      shouldInsert,
      originalIndexFor,
    } = preparePhasesForBillingPeriod({
      schedule: schedule!,
      phaseIndex,
      billingPeriodEnd: billingPeriodEnd!,
    });

    // Propagate new items from the target phase to the right
    for (let i = insertIndex; i < newPhases.length; i++) {
      const baseCurScheduleItems = schedule!.phases[originalIndexFor(i)]
        .items as Stripe.SubscriptionSchedule.Phase.Item[];

      const updatedItems = await computeUpdatedScheduleItems({
        itemSet,
        baseCurScheduleItems,
        attachParams,
        removeCusProducts,
        phaseStart: schedule!.phases[phaseIndex].start_date,
      });

      newPhases[i].items = updatedItems as any;
    }

    const mergedPhases = mergeAdjacentPhasesWithSameItems(newPhases as any);

    return {
      phases: mergedPhases,
      invoiceItems: itemSet.invoiceItems,
      usageFeatures: itemSet.usageFeatures,
    };
  }
};
