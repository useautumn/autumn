import { SupabaseClient } from "@supabase/supabase-js";
import { createStripeCli } from "../utils.js";
import { AppEnv } from "@shared/models/genModels.js";
import Stripe from "stripe";
import { ErrCode, Organization } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";

export const handleSubscriptionScheduleCanceled = async ({
  sb,
  schedule,
  env,
  org,
}: {
  sb: SupabaseClient;
  schedule: Stripe.SubscriptionSchedule;
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({
    org,
    env,
  });

  const cusProduct = await CusProductService.getByScheduleId({
    sb,
    scheduleId: schedule.id,
    orgId: org.id,
    env,
  });

  if (cusProduct) {
    console.log("Handling subscription_schedule.canceled");
    await CusProductService.delete({
      sb,
      cusProductId: cusProduct.id,
    });
    console.log("   - Deleted cus product");

    for (const subId of cusProduct?.subscription_ids!) {
      if (subId === schedule.id) {
        continue;
      }

      try {
        await stripeCli.subscriptions.cancel(subId);
      } catch (error) {
        throw new RecaseError({
          message: `handleSubScheduleCanceled: failed to cancel subscription ${subId}`,
          code: ErrCode.StripeCancelSubscriptionScheduleFailed,
          statusCode: 200,
          data: error,
        });
      }
    }
    console.log("   - Cancelled all other scheduled subs");
  }
};
