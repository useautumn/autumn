import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import Stripe from "stripe";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { ItemSet } from "@/utils/models/ItemSet.js";

export const updateCurSchedule = async ({
  req,
  attachParams,
  schedule,
  sub,
  newPhases,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  schedule: Stripe.SubscriptionSchedule;
  sub: Stripe.Subscription;
  newPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
}) => {
  const { stripeCli } = attachParams;

  if (sub.cancel_at) {
    await stripeCli.subscriptions.update(sub.id, {
      cancel_at: null,
    });
  }

  await stripeCli.subscriptionSchedules.update(schedule.id, {
    phases: newPhases,
  });

  return schedule;
};
