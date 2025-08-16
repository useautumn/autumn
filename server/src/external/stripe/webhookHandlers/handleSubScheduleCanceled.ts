import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import { CusProductStatus, Organization } from "@autumn/shared";
import { createStripeCli } from "../utils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const handleSubscriptionScheduleCanceled = async ({
  db,
  schedule,
  env,
  org,
  logger,
}: {
  db: DrizzleCli;
  schedule: Stripe.SubscriptionSchedule;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const cusProductsOnSchedule = await CusProductService.getByScheduleId({
    db,
    scheduleId: schedule.id,
    orgId: org.id,
    env,
  });

  if (cusProductsOnSchedule.length === 0) return;

  for (const cusProduct of cusProductsOnSchedule) {
    const stripeCli = createStripeCli({ org, env });

    if (cusProduct.status === CusProductStatus.Scheduled) {
      // let otherScheduledIds = cusProduct.scheduled_ids?.filter(
      //   (id: string) => id !== schedule.id
      // );

      // for (const id of otherScheduledIds || []) {
      //   try {
      //     await stripeCli.subscriptionSchedules.cancel(id);
      //     console.log("   - Cancelled scheduled id", id);
      //   } catch (error) {
      //     console.error("Failed to cancel subscription schedule:", id, error);
      //   }
      // }

      await CusProductService.delete({
        db,
        cusProductId: cusProduct.id,
      });
    } else {
      // Here -> Should do something different, maybe... reactivate future product?
      await CusProductService.update({
        db,
        cusProductId: cusProduct.id,
        updates: {
          scheduled_ids: cusProduct.scheduled_ids?.filter(
            (id: string) => id !== schedule.id
          ),
        },
      });
    }
  }

  // Delete from subscriptions
  try {
    let autumnSub = await SubService.getFromScheduleId({
      db,
      scheduleId: schedule.id,
    });

    if (autumnSub && !autumnSub.stripe_id) {
      await SubService.deleteFromScheduleId({
        db,
        scheduleId: schedule.id,
      });
    }
  } catch (error) {
    logger.error(
      `handleSubScheduleCanceled: failed to delete from subscriptions table`,
      error
    );
  }
};
