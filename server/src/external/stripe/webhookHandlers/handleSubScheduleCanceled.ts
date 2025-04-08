import { SupabaseClient } from "@supabase/supabase-js";

import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import { CusProductStatus, Organization } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { createStripeCli } from "../utils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";

export const handleSubscriptionScheduleCanceled = async ({
  sb,
  schedule,
  env,
  org,
  logger,
}: {
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
    "cus products on schedule"
  );
  for (const cusProduct of cusProductsOnSchedule) {
    console.log("   - Cus product", cusProduct.product.name, cusProduct.status);

    // Delete other scheduled IDs?

    const stripeCli = createStripeCli({ org, env });

    if (cusProduct.status === CusProductStatus.Scheduled) {
      let otherScheduledIds = cusProduct.scheduled_ids?.filter(
        (id: string) => id !== schedule.id
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
            (id: string) => id !== schedule.id
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
      error
    );
  }

  // if (cusProduct) {
  //   console.log("Handling subscription_schedule.canceled");
  //   await CusProductService.delete({
  //     sb,
  //     cusProductId: cusProduct.id,
  //   });
  //   console.log("   - Deleted cus product");

  //   for (const subId of cusProduct?.subscription_ids!) {
  //     if (subId === schedule.id) {
  //       continue;
  //     }

  //     try {
  //       await stripeCli.subscriptions.cancel(subId);
  //     } catch (error) {
  //       throw new RecaseError({
  //         message: `handleSubScheduleCanceled: failed to cancel subscription ${subId}`,
  //         code: ErrCode.StripeCancelSubscriptionScheduleFailed,
  //         statusCode: 200,
  //         data: error,
  //       });
  //     }
  //   }
  //   console.log("   - Cancelled all other scheduled subs");
  // }
};
