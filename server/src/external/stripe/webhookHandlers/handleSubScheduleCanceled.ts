import { SupabaseClient } from "@supabase/supabase-js";

import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import { CusProductStatus, Organization } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { createStripeCli } from "../utils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const handleSubscriptionScheduleCanceled = async ({
  db,
  sb,
  schedule,
  env,
  org,
  logger,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  schedule: Stripe.SubscriptionSchedule;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const cusProductsOnSchedule = await CusProductService.getByScheduleId({
    sb,
    scheduleId: schedule.id,
    orgId: org.id,
    env,
  });

  if (cusProductsOnSchedule.length === 0) {
    console.log("   - subscription_schedule.canceled: no cus products found");
    return;
  }

  console.log("Handling subscription_schedule.canceled");
  console.log(
    "   - Found",
    cusProductsOnSchedule.length,
    "cus products on schedule",
  );
  for (const cusProduct of cusProductsOnSchedule) {
    console.log("   - Cus product", cusProduct.product.name, cusProduct.status);

    const stripeCli = createStripeCli({ org, env });

    if (cusProduct.status === CusProductStatus.Scheduled) {
      let otherScheduledIds = cusProduct.scheduled_ids?.filter(
        (id: string) => id !== schedule.id,
      );

      for (const id of otherScheduledIds) {
        try {
          await stripeCli.subscriptionSchedules.cancel(id);
          console.log("   - Cancelled scheduled id", id);
        } catch (error) {
          console.error("Failed to cancel subscription schedule:", id, error);
        }
      }

      await CusProductService.delete({
        sb,
        cusProductId: cusProduct.id,
      });
    } else {
      // Here -> Should do something different, maybe... reactivate future product?
      await CusProductService.update({
        sb,
        cusProductId: cusProduct.id,
        updates: {
          scheduled_ids: cusProduct.scheduled_ids?.filter(
            (id: string) => id !== schedule.id,
          ),
        },
      });
    }
  }

  // Delete from subscriptions
  try {
    let autumnSub = await SubService.getFromScheduleId({
      sb,
      scheduleId: schedule.id,
    });

    if (autumnSub && !autumnSub.stripe_id) {
      await SubService.deleteFromScheduleId({
        sb,
        scheduleId: schedule.id,
      });
    }
  } catch (error) {
    logger.error(
      `handleSubScheduleCanceled: failed to delete from subscriptions table`,
      error,
    );
  }
};
