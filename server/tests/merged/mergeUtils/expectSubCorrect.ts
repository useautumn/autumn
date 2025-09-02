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
  logPhases,
  similarUnix,
} from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { getExistingUsageFromCusProducts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { subIsCanceled } from "@/external/stripe/stripeSubUtils.js";
import { defaultApiVersion } from "tests/constants.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { notNullish } from "@shared/utils/utils.js";

const compareActualItems = async ({
  actualItems,
  expectedItems,
  type,
  fullCus,
  db,
  phaseStartsAt,
}: {
  actualItems: any[];
  expectedItems: any[];
  type: "sub" | "schedule";
  fullCus: FullCustomer;
  phaseStartsAt?: number;
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
      // if (price) {
      //   console.log(`Autumn price:`, `${price.id} - ${formatPrice({ price })}`);
      // }

      // Actual items
      console.log(`(${type}) Actual items (${actualItems.length}):`);
      await logPhaseItems({
        db,
        items: actualItems,
      });

      console.log(`(${type}) Expected items (${expectedItems.length}):`);
      await logPhaseItems({
        db,
        items: expectedItems,
      });
    }

    expect(actualItem).to.exist;

    if (actualItem?.quantity !== (expectedItem as any).quantity) {
      if (phaseStartsAt) {
        console.log(`Phase starts at: ${formatUnixToDateTime(phaseStartsAt)}`);
      }

      console.log("Actual items:");
      await logPhaseItems({
        db,
        items: actualItems,
      });

      console.log("Expected items:");
      await logPhaseItems({
        db,
        items: expectedItems,
      });

      console.log(
        `Item quantity mismatch: ${actualItem?.quantity} !== ${expectedItem.quantity}`
      );

      const price = await PriceService.getByStripeId({
        db,
        stripePriceId: expectedItem.price,
      });
      if (price) {
        console.log(
          `Autumn price:`,
          `${price?.product.name} - ${formatPrice({ price })}`
        );
      }

      console.log("--------------------------------");
    }

    expect(actualItem?.quantity).to.equal(
      (expectedItem as any).quantity,
      `actual items quantity should be equals to ${expectedItem.quantity}`
    );
  }

  expect(actualItems.length).to.equal(expectedItems.length);
};

export const expectSubToBeCorrect = async ({
  db,
  customerId,
  org,
  env,

  entityId,
  shouldBeCanceled,
  shouldBeTrialing = false,
  flags,
  subId,
  rewards,
}: {
  db: DrizzleCli;
  customerId: string;
  org: Organization;
  env: AppEnv;

  entityId?: string;
  shouldBeCanceled?: boolean;
  shouldBeTrialing?: boolean;
  flags?: {
    checkNotTrialing?: boolean;
  };
  subId?: string;
  rewards?: string[];
}) => {
  const stripeCli = createStripeCli({ org, env });
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
    withEntities: true,
  });

  // 1. Only 1 sub ID available
  let cusProducts = fullCus.customer_products;
  if (!subId) {
    const subIds = cusProductToSubIds({ cusProducts });
    subId = subIds[0];
    expect(subIds.length, "should only have 1 sub ID available").to.equal(1);
  } else {
    cusProducts = cusProducts.filter((cp) =>
      cp.subscription_ids?.includes(subId!)
    );
  }

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

  // console.log(`\n\nChecking sub correct`);
  let printCusProduct = false;
  if (printCusProduct) {
    console.log(`\n\nChecking sub correct`);
  }

  for (const cusProduct of cusProducts) {
    const prices = cusProductToPrices({ cusProduct });
    const ents = cusProductToEnts({ cusProduct });
    const product = cusProductToProduct({ cusProduct });

    // Add to schedules
    const scheduleIndexes: number[] = [];
    const apiVersion = cusProduct.api_version || defaultApiVersion;

    if (isFreeProduct(product.prices)) {
      expect(cusProduct.subscription_ids, "free product should have no subs").to
        .be.empty;
      continue;
    }

    if (printCusProduct) {
      console.log(
        `Cus product: ${cusProduct.product.name}, Status: ${cusProduct.status}, Entity ID: ${cusProduct.entity_id}`
      );
      console.log(`Starts at: ${formatUnixToDateTime(cusProduct.starts_at)}`);
    }

    scheduleUnixes.forEach((unix, index) => {
      if (
        cusProduct.status === CusProductStatus.Scheduled &&
        cusProductInPhase({ phaseStartMillis: unix, cusProduct })
      ) {
        return scheduleIndexes.push(index);
      }

      if (cusProduct.status === CusProductStatus.Scheduled) return;

      if (cusProduct.product.is_add_on) {
        // 1. If it's canceled
        if (cusProduct.canceled && (cusProduct.ended_at || 0) > unix) {
          return scheduleIndexes.push(index);
        } else if (!cusProduct.canceled) {
          return scheduleIndexes.push(index);
        }

        return;
      }

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
      ) {
        scheduleIndexes.push(index);
      }
    });

    if (printCusProduct) {
      console.log(`Schedule indexes:`, scheduleIndexes);
      console.log("--------------------------------");
    }

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
      let existingUsage = getExistingUsageFromCusProducts({
        entitlement: relatedEnt,
        cusProducts,
        entities: fullCus.entities,
        carryExistingUsages: true,
        internalEntityId: cusProduct.internal_entity_id || undefined,
      });

      const res = priceToStripeItem({
        price,
        relatedEnt,
        product,
        org,
        options,
        existingUsage,
        withEntity: !!entityId,
        isCheckout: false,
        apiVersion,
        productOptions: cusProduct.quantity
          ? {
              product_id: product.id,
              quantity: cusProduct.quantity,
            }
          : undefined,
      });

      if (res?.lineItem && nullish(res.lineItem.quantity)) {
        res.lineItem.quantity = 0;
      }

      // console.log("API VERSION:", apiVersion);
      // console.log("LINE ITEM:", res?.lineItem);
      if (options?.upcoming_quantity && res?.lineItem) {
        res.lineItem.quantity = options.upcoming_quantity;
      }

      const lineItem: any = res?.lineItem;
      if (lineItem && res?.lineItem) {
        if (addToSub) {
          const existingIndex = supposedSubItems.findIndex(
            (si: any) => si.price === lineItem.price
          );

          if (existingIndex !== -1) {
            // @ts-ignore
            supposedSubItems[existingIndex].quantity += lineItem.quantity;
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

  const sub = await stripeCli.subscriptions.retrieve(subId, {
    expand: ["discounts.coupon"],
  });

  const actualItems = sub.items.data.map((item: any) => ({
    price: item.price.id,
    quantity: item.quantity || 0,
  }));

  const subCouponIds = sub.discounts?.map(
    (discount: any) => discount.coupon.id
  );
  if (rewards) {
    for (const reward of rewards) {
      const corresponding = subCouponIds.find(
        (subCouponId: any) => subCouponId === reward
      );
      expect(corresponding, `reward ${reward} should be in sub`).to.exist;
    }
    expect(subCouponIds.length).to.equal(rewards.length);
  }

  await compareActualItems({
    actualItems,
    expectedItems: supposedSubItems,
    type: "sub",
    fullCus,
    db,
  });

  if (shouldBeTrialing) {
    expect(sub.status, "sub should be trialing").to.equal("trialing");
  }

  if (flags?.checkNotTrialing) {
    expect(sub.status, "sub should not be trialing").to.not.equal("trialing");
  }

  // Should be canceled
  const cusSubShouldBeCanceled = cusProducts.every((cp) => {
    if (cp.subscription_ids?.includes(subId!)) {
      // 1. Get scheduled product
      const { curScheduledProduct } = getExistingCusProducts({
        cusProducts,
        product: cp.product,
        internalEntityId: cp.internal_entity_id,
      });

      if (curScheduledProduct) {
        const scheduledProduct = cusProductToProduct({
          cusProduct: curScheduledProduct,
        });
        if (!isFreeProduct(scheduledProduct.prices)) {
          return false;
        }
      }

      return cp.canceled;
    }

    return true;
  });

  // console.log("Sub should be canceled:", cusSubShouldBeCanceled);

  const finalShouldBeCanceled = notNullish(shouldBeCanceled)
    ? shouldBeCanceled!
    : cusSubShouldBeCanceled;

  // console.log("Final should be canceled:", finalShouldBeCanceled);

  if (finalShouldBeCanceled) {
    expect(sub.schedule, "sub should NOT have a schedule").to.be.null;
    // expect(sub.cancel_at, "sub should be canceled").to.exist;
    expect(subIsCanceled({ sub }), "sub should be canceled").to.be.true;
    return;
  }

  const schedule =
    supposedPhases.length > 0
      ? await stripeCli.subscriptionSchedules.retrieve(sub.schedule as string, {
          expand: ["phases.items.price"],
        })
      : null;

  // console.log("--------------------------------");
  // console.log("Supposed phases:");
  // await logPhases({
  //   phases: supposedPhases,
  //   db,
  // });

  // console.log("--------------------------------");
  // console.log("Actual phases:");

  // await logPhases({
  //   phases: (schedule?.phases as any) || [],
  //   db,
  // });

  for (let i = 0; i < supposedPhases.length; i++) {
    const supposedPhase = supposedPhases[i];

    if (supposedPhase.items.length === 0) continue;

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
      phaseStartsAt: supposedPhase.start_date,
    });
  }

  expect(sub.cancel_at, "sub should not be canceled").to.be.null;
  // if (shouldBeCanceled) {
  //   expect(sub.cancel_at, "sub should be canceled").to.exist;
  // } else {
  // }
};
