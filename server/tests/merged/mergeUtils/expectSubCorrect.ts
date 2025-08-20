import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  FullCustomer,
  Organization,
} from "@autumn/shared";
import { cusProductToSubIds } from "../mergeUtils.test.js";
import { expect } from "chai";
import { priceToStripeItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem.js";
import {
  cusProductToPrices,
  cusProductToEnts,
  cusProductToProduct,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import {
  formatPrice,
  getPriceEntitlement,
  getPriceOptions,
} from "@/internal/products/prices/priceUtils.js";
import { logSubItems } from "@/utils/scriptUtils/logUtils/logSubItems.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { paramsToCurSubSchedule } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import Stripe from "stripe";
import { getUniqueUpcomingSchedulePairs } from "@/internal/customers/cusProducts/cusProductUtils/getUpcomingSchedules.js";
import { formatUnixToDateTime, nullish } from "@/utils/genUtils.js";
import {
  cusProductInPhase,
  logPhaseItems,
  similarUnix,
} from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

const compareActualItems = async ({
  actualItems,
  expectedItems,
  type,
  fullCus,
  db,
}: {
  actualItems: any[];
  expectedItems: any[];
  type: "sub" | "schedule";
  fullCus: FullCustomer;
  db: DrizzleCli;
}) => {
  for (const expectedItem of expectedItems) {
    const actualItem = actualItems.find(
      (item: any) => item.price === (expectedItem as any).price
    );

    if (!actualItem) {
      // Search for price by stripe id
      const price = await PriceService.getByStripeId({
        db,
        stripePriceId: expectedItem.price,
      });
      console.log(`(${type}) Missing item:`, expectedItem);
      if (price) {
        console.log(`Autumn price:`, `${price.id} - ${formatPrice({ price })}`);
      }

      // Actual items
      console.log(`(${type}) Actual items (${actualItems.length}):`);
      await logPhaseItems({
        db,
        items: actualItems,
      });
    }

    expect(actualItem).to.exist;
    expect(actualItem?.quantity).to.equal((expectedItem as any).quantity);
  }

  expect(actualItems.length).to.equal(expectedItems.length);
};

export const expectSubToBeCorrect = async ({
  db,
  customerId,
  org,
  env,
}: {
  db: DrizzleCli;
  customerId: string;
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
  });

  // 1. Only 1 sub ID available
  const cusProducts = fullCus.customer_products;
  const subIds = cusProductToSubIds({ cusProducts });
  expect(subIds.length, "should only have 1 sub ID available").to.equal(1);

  // Get the items that should be in the sub
  const supposedSubItems = [];

  const scheduleUnixes = getUniqueUpcomingSchedulePairs({
    cusProducts,
    now: Date.now(),
  });

  const supposedPhases: any[] = scheduleUnixes.map((unix) => {
    return {
      start_date: unix, // milliseconds
      items: [],
    };
  });

  for (const cusProduct of cusProducts) {
    const prices = cusProductToPrices({ cusProduct });
    const ents = cusProductToEnts({ cusProduct });
    const product = cusProductToProduct({ cusProduct });

    // Add to schedules
    const scheduleIndexes: number[] = [];
    scheduleUnixes.forEach((unix, index) => {
      // 1. Schedule
      console.log(`Unix: `, formatUnixToDateTime(unix));
      console.log(
        `Cus product: ${cusProduct.product.name}, Status: ${cusProduct.status}`
      );
      console.log(`Starts at: ${formatUnixToDateTime(cusProduct.starts_at)}`);

      if (
        cusProduct.status === CusProductStatus.Scheduled &&
        cusProductInPhase({ phaseStartMillis: unix, cusProduct })
      )
        return scheduleIndexes.push(index);

      // 2. If main product, check that schedule is AFTER this phase
      const curScheduledProduct = cusProducts.find(
        (cp) =>
          cp.product.group === product.group &&
          cp.status === CusProductStatus.Scheduled &&
          (cp.internal_entity_id
            ? cp.internal_entity_id == cusProduct.internal_entity_id
            : nullish(cp.internal_entity_id))
      );

      if (!curScheduledProduct) return scheduleIndexes.push(index);

      // If scheduled product NOT in phase, add main product to schedule
      if (
        !cusProductInPhase({
          phaseStartMillis: unix,
          cusProduct: curScheduledProduct,
        })
      )
        scheduleIndexes.push(index);
    });

    console.log(`Scheduled indexes:`, scheduleIndexes);
    console.log("--------------------------------");

    // const hasScheduledProduct =
    cusProduct.status !== CusProductStatus.Scheduled &&
      !cusProduct.product.is_add_on &&
      cusProducts.some(
        (cp) =>
          cp.product.group === product.group &&
          ACTIVE_STATUSES.includes(cp.status)
      );

    const addToSub = cusProduct.status !== CusProductStatus.Scheduled;

    for (const price of prices) {
      const relatedEnt = getPriceEntitlement(price, ents);
      const options = getPriceOptions(price, cusProduct.options);

      const res = priceToStripeItem({
        price,
        relatedEnt,
        product,
        org,
        options,
        existingUsage: 0,
        withEntity: true,
        isCheckout: false,
        apiVersion: APIVersion.v1_4,
      });

      const lineItem: any = res?.lineItem;
      if (lineItem && res?.lineItem) {
        if (addToSub) {
          const existingIndex = supposedSubItems.findIndex(
            (si: any) => si.price === lineItem.price
          );

          if (existingIndex !== -1) {
            // @ts-ignore
            supposedSubItems[existingIndex].quantity += lineItem.quantity!;
          } else {
            supposedSubItems.push({
              ...res.lineItem,
              priceStr: `${product.id}-${formatPrice({ price })}`,
            });
          }
        }

        for (const scheduleIndex of scheduleIndexes) {
          const phase = supposedPhases[scheduleIndex];
          const existingIndex = phase.items.findIndex(
            (item: any) => item.price === lineItem.price
          );

          if (existingIndex !== -1) {
            phase.items[existingIndex].quantity += lineItem.quantity!;
          } else {
            phase.items.push({
              price: lineItem.price,
              quantity: lineItem.quantity!,
            });
          }
        }
      }
    }
  }

  const sub = await stripeCli.subscriptions.retrieve(subIds[0]);

  const actualItems = sub.items.data.map((item: any) => ({
    price: item.price.id,
    quantity: item.quantity || 0,
  }));

  await compareActualItems({
    actualItems,
    expectedItems: supposedSubItems,
    type: "sub",
    fullCus,
    db,
  });

  // // Check schedule
  // const scheduleShouldExist = cusProducts.some((cusProduct) => {
  //   const product = cusProductToProduct({ cusProduct });
  //   return (
  //     cusProduct.status === CusProductStatus.Scheduled &&
  //     !isOneOff(product.prices) &&
  //     !isFreeProduct(product.prices)
  //   );
  // });

  const schedule =
    supposedPhases.length > 0
      ? await stripeCli.subscriptionSchedules.retrieve(sub.schedule as string, {
          expand: ["phases.items.price"],
        })
      : null;

  // await logPhaseItems({
  //   db,
  //   items: supposedPhases[0].items,
  // });

  for (let i = 0; i < supposedPhases.length; i++) {
    const supposedPhase = supposedPhases[i];
    const actualPhase = schedule?.phases?.[i + 1];
    expect(schedule?.phases.length).to.be.greaterThan(i + 1);

    expect(
      similarUnix({
        unix1: supposedPhase.start_date,
        unix2: actualPhase!.start_date * 1000,
      })
    ).to.be.true;

    const actualItems =
      actualPhase?.items.map((item) => ({
        price: (item.price as Stripe.Price).id,
        quantity: item.quantity,
      })) || [];

    await compareActualItems({
      actualItems,
      expectedItems: supposedPhase.items,
      type: "schedule",
      fullCus,
      db,
    });
    // const scheduleIndex = scheduleUnixes.findIndex((unix) => unix === supposedPhases[i].start_date);
    // if (scheduleIndex !== -1) {
    //   supposedPhases[i].schedule_index = scheduleIndex;
    // }
    // const scheduleIndex = scheduleUnixes.findIndex((unix) => unix === phase.start_date);
    // if (scheduleIndex !== -1) {
    //   phase.schedule_index = scheduleIndex;
    // }
  }

  // if (!scheduleShouldExist) {
  //   expect(sub.schedule).to.be.null;
  //   return;
  // }

  // expect(sub.schedule).to.exist;

  // const scheduleItems = schedule.phases?.[1]?.items.map((item) => ({
  //   price: (item.price as Stripe.Price)?.id,
  //   quantity: item.quantity,
  // }));
  // expect(scheduleItems).to.exist;
  // compareActualItems({
  //   actualItems: scheduleItems,
  //   expectedItems: supposedScheduleItems,
  //   type: "schedule",
  // });
};
