import { DrizzleCli } from "@/db/initDrizzle.js";
import { getStripeSchedules } from "@/external/stripe/stripeSubUtils.js";
import { updateScheduledSubWithNewItems } from "@/internal/customers/change-product/scheduleUtils/updateScheduleWithNewItems.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import {
  FullCusProduct,
  intervalsDifferent,
  intervalsSame,
} from "@autumn/shared";
import Stripe from "stripe";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";

export const updateCurSchedules = async ({
  db,
  stripeCli,
  curCusProduct,
  attachParams,
  itemSets,
  logger,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  itemSets: ItemSet[];
  logger: any;
}) => {
  const { curMainProduct, curScheduledProduct } = attachParamToCusProducts({
    attachParams,
  });

  let scheduleIds = curCusProduct.scheduled_ids || [];

  if (scheduleIds.length == 0) {
    return;
  }

  let schedules = await getStripeSchedules({
    stripeCli,
    scheduleIds,
  });

  for (const scheduleObj of schedules) {
    const { interval, intervalCount, schedule } = scheduleObj;

    // If schedule has passed, skip this step.
    let phase = schedule.phases.length > 0 ? schedule.phases[0] : null;
    let now = attachParams.now || Date.now();

    if (phase && phase.start_date * 1000 < now) {
      logger.info("Note: Schedule has passed, skipping");
      continue;
    }

    // Get corresponding item set

    const itemSet = itemSets.find((itemSet) =>
      intervalsSame({
        intervalA: { interval, intervalCount },
        intervalB: {
          interval: itemSet.interval,
          intervalCount: itemSet.intervalCount,
        },
      })
    );
    if (!itemSet) {
      continue;
    }

    await updateScheduledSubWithNewItems({
      scheduleObj,
      newItems: itemSet.items,
      stripeCli,
      cusProductsForGroup: [curMainProduct, curScheduledProduct],
      itemSet,
      db,
      org: attachParams.org,
      env: attachParams.customer.env,
    });
  }
};
