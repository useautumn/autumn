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
  newItems,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  schedule: Stripe.SubscriptionSchedule;
  sub: Stripe.Subscription;
  newItems: any[];
}) => {
  const { stripeCli } = attachParams;

  console.log("UPDATING CURRENT SCHEDULE:", schedule.id);
  console.log("New items:", newItems);

  if (sub.cancel_at) {
    await stripeCli.subscriptions.update(sub.id, {
      cancel_at: null,
    });
  }

  await stripeCli.subscriptionSchedules.update(schedule.id, {
    phases: [
      {
        items: schedule.phases[0].items.map((item) => ({
          price: (item.price as Stripe.Price).id,
          quantity: item.quantity,
        })),
        start_date: schedule.phases[0].start_date,
        end_date: schedule.phases[0].end_date,
      },
      {
        items: newItems,
        start_date: schedule.phases[0].end_date,
      },
    ],
  });

  // await CusProductService.update({
  //   db: req.db,
  //   cusProductId: curCusProduct!.id,
  //   updates: {
  //     scheduled_ids: [schedule!.id],
  //     canceled: true,
  //   },
  // });

  return schedule;
};
