import {
  AppEnv,
  FullCusProduct,
  intervalsSame,
  Organization,
} from "@autumn/shared";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { getStripeSchedules } from "@/external/stripe/stripeSubUtils.js";
import { getScheduleIdsFromCusProducts } from "../scheduleUtils.js";
import Stripe from "stripe";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { updateScheduledSubWithNewItems } from "./updateScheduleWithNewItems.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const getOtherCusProductsOnSub = async ({
  cusProducts,
  curMainProduct,
  curMainSubIds = [],
}: {
  cusProducts: FullCusProduct[];
  curMainProduct: FullCusProduct;
  curMainSubIds?: string[] | null;
}) => {
  let otherCusProductsWithSameSub: FullCusProduct[] = [];
  for (const cusProduct of cusProducts) {
    // 1. Check if contains one of the curMainSubIds
    if (
      cusProduct.id === curMainProduct.id ||
      !curMainSubIds?.some((subId) =>
        cusProduct?.subscription_ids?.includes(subId)
      )
    ) {
      continue;
    }

    // 2. Check if there's a scheduled product
    let { curScheduledProduct: otherScheduledProduct } =
      await getExistingCusProducts({
        product: cusProduct.product,
        cusProducts: cusProducts,
        internalEntityId: cusProduct.internal_entity_id || undefined,
      });

    if (otherScheduledProduct) {
      otherCusProductsWithSameSub.push(otherScheduledProduct);
    }
  }
  return otherCusProductsWithSameSub;
};

// If other cus products on schedule, add cur main product regular items to schedule...
export const addCurMainProductToSchedule = async ({
  db,
  org,
  env,
  stripeCli,
  otherCusProductsOnSub,
  oldItemSets,
  curMainProduct,
  logger,
}: {
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  stripeCli: Stripe;
  otherCusProductsOnSub: FullCusProduct[];
  oldItemSets: ItemSet[];
  curMainProduct: FullCusProduct;
  logger: any;
}) => {
  let schedules = await getStripeSchedules({
    stripeCli: stripeCli,
    scheduleIds: getScheduleIdsFromCusProducts({
      cusProducts: otherCusProductsOnSub,
    }),
  });

  for (const scheduleObj of schedules) {
    const { schedule, interval, intervalCount } = scheduleObj;

    let oldItemSet = oldItemSets.find((itemSet) =>
      intervalsSame({
        intervalA: { interval, intervalCount },
        intervalB: itemSet,
      })
    );

    await updateScheduledSubWithNewItems({
      scheduleObj: scheduleObj,
      newItems: oldItemSet?.items || [],
      cusProductsForGroup: [],
      stripeCli: stripeCli,
      itemSet: null,
      db,
      org: org,
      env: env,
    });

    // Put back schedule id into curMainProduct
    await CusProductService.update({
      db,
      cusProductId: curMainProduct!.id,
      updates: {
        scheduled_ids: [...(curMainProduct!.scheduled_ids || []), schedule.id],
      },
    });

    logger.info(
      `✅ Added old items for product ${curMainProduct.product.name} to schedule: ${schedule.id}`
    );
  }
};
