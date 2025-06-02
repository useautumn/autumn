// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
// import { getAlignedIntervalUnix } from "@/internal/products/prices/billingIntervalUtils.js";
// import { ItemSet } from "@/utils/models/ItemSet.js";
// import { FullCusProduct } from "@autumn/shared";
// import { AttachParams } from "autumn-js";
// import Stripe from "stripe";

// export const createRestOfSubs = async ({
//   db,
//   stripeCli,
//   anchorToUnix,
//   attachParams,
//   itemSets,
//   logger,
// }: {
//   db: DrizzleCli;
//   stripeCli: Stripe;
//   anchorToUnix: number;
//   attachParams: AttachParams;
//   itemSets: ItemSet[];
//   logger: any;
// }) => {
//   for (const itemSet of itemSets) {

//     const newSub = (await createStripeSub({
//       db,
//       stripeCli,
//       customer: attachParams.customer,
//       org: attachParams.org,
//       itemSet,
//       invoiceOnly: attachParams.invoiceOnly || false,
//       freeTrial: attachParams.freeTrial,
//       billingCycleAnchorUnix,
//     })) as Stripe.Subscription;

//     newSubs.push(newSub);
//     newSubIds.push(newSub.id);
//     invoiceIds.push(newSub.latest_invoice as string);
//   }
// };
