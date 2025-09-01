import type { FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";

export const cancelCurSubs = async ({
	curCusProduct,
	curSubs,
	stripeCli,
}: {
	curCusProduct: FullCusProduct;
	curSubs: Stripe.Subscription[];
	stripeCli: Stripe;
}) => {
	// let latestPeriodEnd = curSubs[0].current_period_end;
	// let intervalToOtherSubs: Record<
	//   string,
	//   {
	//     otherSubItems: Stripe.SubscriptionItem[];
	//     otherSub: Stripe.Subscription;
	//   }
	// > = {};
	// for (const sub of curSubs) {
	//   let latestEndDate = new Date(latestPeriodEnd * 1000);
	//   let curEndDate = new Date(sub.current_period_end * 1000);
	//   const { otherSubItems } = await getSubItemsForCusProduct({
	//     stripeSub: sub,
	//     cusProduct: curCusProduct,
	//   });
	//   // let interval = sub.items.data[0].price.recurring!.interval;
	//   let subInterval = subToAutumnInterval(sub);
	//   let intervalKey = toIntervalKey(subInterval);
	//   intervalToOtherSubs[intervalKey] = {
	//     otherSubItems,
	//     otherSub: sub,
	//   };
	//   if (notNullish(sub.schedule)) {
	//     await stripeCli.subscriptionSchedules.release(sub.schedule as string);
	//   }
	//   if (differenceInDays(latestEndDate, curEndDate) > 10) {
	//     await stripeCli.subscriptions.update(sub.id, {
	//       cancel_at: latestPeriodEnd,
	//       cancellation_details: {
	//         comment: "autumn_downgrade",
	//       },
	//     });
	//   } else {
	//     await stripeCli.subscriptions.update(sub.id, {
	//       cancel_at_period_end: true,
	//       cancellation_details: {
	//         comment: "autumn_downgrade",
	//       },
	//     });
	//   }
	// }
	// return intervalToOtherSubs;
};
