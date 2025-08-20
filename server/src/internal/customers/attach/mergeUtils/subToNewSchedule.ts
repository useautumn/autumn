import { ExtendedRequest } from "@/utils/models/Request.js";
import { paramsToScheduleItems } from "./paramsToScheduleItems.js";
import Stripe from "stripe";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachConfig, FullCusProduct } from "@autumn/shared";
import { createSubSchedule } from "../attachFunctions/scheduleFlow/createSubSchedule.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";

export const subToNewSchedule = async ({
  req,
  sub,
  attachParams,
  config,
  endOfBillingPeriod,
  removeCusProducts,
}: {
  req: ExtendedRequest;
  sub: Stripe.Subscription;
  attachParams: AttachParams;
  config: AttachConfig;
  endOfBillingPeriod: number;
  removeCusProducts?: FullCusProduct[];
}) => {
  const { logger } = req;
  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  const scheduleItems = await paramsToScheduleItems({
    req,
    sub,
    attachParams,
    config,
    removeCusProducts,
    billingPeriodEnd: endOfBillingPeriod,
  });

  const { stripeCli } = attachParams;
  let newSchedule: Stripe.SubscriptionSchedule | undefined = undefined;

  // if (sub.cancel_at) {
  //   logger.info(`UNCANCELING SUB ${sub.id}`);
  //   await stripeCli.subscriptions.update(sub.id, {
  //     cancel_at: null,
  //   });
  // }

  if (scheduleItems.items.length > 0) {
    itemSet.subItems = scheduleItems.items;
    const curSubItems = sub.items.data;

    // Create schedule from existing subscription
    newSchedule = await stripeCli.subscriptionSchedules.create({
      from_subscription: sub.id,
    });

    // console.log("SChedule ID: ", newSchedule.id);

    // const newScheduleId = "sub_sched_1RxyM89mx3u0jkgOgbbsAbDS";
    const newScheduleId = newSchedule.id;
    await stripeCli.subscriptionSchedules.update(newScheduleId, {
      phases: [
        {
          items: newSchedule.phases[0].items.map((item) => ({
            price: item.price as string,
            quantity: item.quantity,
          })),
          start_date: newSchedule.phases[0].start_date,
          end_date: endOfBillingPeriod,
        },
        {
          items: scheduleItems.items,
          start_date: endOfBillingPeriod,
        },
      ],
      end_behavior: "release",
    });

    await CusProductService.updateByStripeSubId({
      db: req.db,
      stripeSubId: sub.id!,
      updates: {
        scheduled_ids: [newSchedule!.id],
      },
    });
  }

  return newSchedule as Stripe.SubscriptionSchedule;
};

// phases: ([
//   {
//     items: scheduleItems.items,
//     // Set proration behavior for this phase transition
//     proration_behavior: "create_prorations", // Options: 'create_prorations', 'none', 'always_invoice'
//     // Optional: Set how long this phase should last
//     iterations: 1, // Number of billing cycles for this phase
//     // Optional: Add metadata for this phase
//     metadata: {
//       phase_type: "scheduled_update",
//       created_by: "attach_flow",
//     },
//   },
// ],

// Option 2: Use your existing createSubSchedule function
// newSchedule = await createSubSchedule({
//   db: req.db,
//   attachParams,
//   itemSet,
//   endOfBillingPeriod,
// });
