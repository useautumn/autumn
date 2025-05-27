import Stripe from "stripe";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { FullCusProduct, Organization } from "@autumn/shared";
import { AppEnv } from "autumn-js";
import { getFilteredScheduleItems } from "./getFilteredScheduleItems.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const updateScheduledSubWithNewItems = async ({
  db,
  scheduleObj,
  newItems,
  cusProducts,
  stripeCli,
  itemSet,
  org,
  env,
}: {
  db: DrizzleCli;
  scheduleObj: any;
  newItems: any[];
  cusProducts: (FullCusProduct | null | undefined)[];
  stripeCli: Stripe;
  itemSet: ItemSet | null;
  org: Organization;
  env: AppEnv;
}) => {
  const { schedule } = scheduleObj;

  let filteredScheduleItems = getFilteredScheduleItems({
    scheduleObj,
    cusProducts: cusProducts,
  });

  // 2. Add new schedule items
  let newScheduleItems = filteredScheduleItems
    .map((item: any) => ({
      price: item.price,
    }))
    .concat(
      ...newItems.map((item: any) => ({
        price: item.price,
      })),
    );

  await stripeCli.subscriptionSchedules.update(schedule.id, {
    phases: [
      {
        items: newScheduleItems,
        start_date: schedule.phases[0].start_date,
      },
    ],
  });

  // Update sub schedule ID
  if (itemSet) {
    await SubService.addUsageFeatures({
      db,
      scheduleId: scheduleObj.schedule.id,
      usageFeatures: itemSet.usageFeatures,
      orgId: org.id,
      env: env,
    });
  }
};
