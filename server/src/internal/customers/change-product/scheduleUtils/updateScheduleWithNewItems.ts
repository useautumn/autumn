import { SubService } from "@/internal/subscriptions/SubService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { FullCusProduct, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv } from "autumn-js";
import Stripe from "stripe";
import { getFilteredScheduleItems } from "./getFilteredScheduleItems.js";

export const updateScheduledSubWithNewItems = async ({
  sb,
  scheduleObj,
  newItems,
  cusProducts,
  stripeCli,
  itemSet,
  org,
  env,
}: {
  sb: SupabaseClient;
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
      }))
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
      sb,
      scheduleId: scheduleObj.schedule.id,
      usageFeatures: itemSet.usageFeatures,
      orgId: org.id,
      env: env,
    });
  }
};
