import Stripe from "stripe";
import { mergeNewScheduleItems } from "./mergeNewSubItems.js";
import { getCusProductsToRemove } from "./paramsToSubItems.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  cusProductsToCusPrices,
  cusProductToPrices,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  priceToScheduleItem,
  scheduleItemInCusProduct,
  scheduleItemToPrice,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";
import { differenceInDays } from "date-fns";
import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { mergeAdjacentPhasesWithSameItems } from "./phaseUtils/mergeSimilarPhases.js";
import { preparePhasesForBillingPeriod } from "./phaseUtils/upsertNewPhase.js";

export const removeCusProductFromScheduleItems = ({
  curScheduleItems,
  updateScheduleItems,
  allCusProducts,
  cusProduct,
  itemSet,
  phaseStart,
}: {
  curScheduleItems: Stripe.SubscriptionSchedule.Phase.Item[];
  updateScheduleItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[];
  allCusProducts: FullCusProduct[];
  cusProduct: FullCusProduct;
  itemSet?: ItemSet;
  phaseStart?: number;
}) => {
  const prices = cusProductToPrices({ cusProduct });
  let newScheduleItems = structuredClone(updateScheduleItems);

  const removePriceIds: string[] = [];
  // console.log(
  //   "Cur schedule items:",
  //   curScheduleItems.map((i) => ({
  //     price: (i.price as Stripe.Price).id,
  //     quantity: i.quantity,
  //   }))
  // );

  const printRemoveLogs = true;
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
      // console.log(
      //   "Removing cus product:",
      //   cusProduct.product.name,
      //   cusProduct.id,
      //   cusProduct.entity_id
      // );
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
const computeUpdatedScheduleItems = ({
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
}): Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] => {
  let newScheduleItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] =
    mergeNewScheduleItems({
      itemSet,
      curScheduleItems: baseCurScheduleItems,
    });

  const cusProductsToRemove =
    removeCusProducts || getCusProductsToRemove({ attachParams });

  const allCusProducts = attachParams.customer.customer_products;

  console.log("New schedule items:");
  logScheduleItems({ items: newScheduleItems, cusProducts: allCusProducts });
  for (const cusProduct of cusProductsToRemove) {
    newScheduleItems = removeCusProductFromScheduleItems({
      curScheduleItems: baseCurScheduleItems,
      updateScheduleItems: newScheduleItems,
      allCusProducts,
      cusProduct,
      itemSet,
      phaseStart,
    });
  }

  console.log("New schedule items after removing cus products:");
  logScheduleItems({ items: newScheduleItems, cusProducts: allCusProducts });

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

    const newScheduleItems = computeUpdatedScheduleItems({
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

      const updatedItems = computeUpdatedScheduleItems({
        itemSet,
        baseCurScheduleItems,
        attachParams,
        removeCusProducts,
        phaseStart: schedule!.phases[phaseIndex].start_date,
      });

      newPhases[i].items = updatedItems as any;
    }

    const mergedPhases = mergeAdjacentPhasesWithSameItems(newPhases as any);

    console.log(
      "Merged phases:",
      JSON.stringify(
        mergedPhases.map((p) => {
          const start = typeof p.start_date === "number" ? p.start_date : 0;
          const end = typeof p.end_date === "number" ? p.end_date : 0;
          return {
            items: p.items.map((i) => ({
              price: i.price,
              quantity: i.quantity,
            })),
            start_date: formatUnixToDateTime(start * 1000),
            end_date: formatUnixToDateTime(end * 1000),
          };
        }),
        null,
        2
      )
    );

    console.log("--------------------------------");
    // throw new Error("stop");

    return {
      phases: mergedPhases,
      invoiceItems: itemSet.invoiceItems,
      usageFeatures: itemSet.usageFeatures,
    };
  }
};

// let newScheduleItems: any[] = mergeNewScheduleItems({
//   itemSet,
//   curScheduleItems,
// });

// let cusProductsToRemove =
//   removeCusProducts || getCusProductsToRemove({ attachParams });

// const allCusProducts = attachParams.customer.customer_products;

// for (const cusProduct of cusProductsToRemove) {
//   newScheduleItems = removeCusProductFromScheduleItems({
//     curScheduleItems,
//     updateScheduleItems: newScheduleItems,
//     allCusProducts,
//     cusProduct,
//     itemSet,
//   });
// }

// return {
//   items: newScheduleItems,
//   invoiceItems: itemSet.invoiceItems,
//   usageFeatures: itemSet.usageFeatures,
// };
