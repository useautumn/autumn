// import Stripe from "stripe";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
// import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
// import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
// import {
//   AttachConfig,
//   FullCusProduct,
//   intervalsSame,
//   ProrationBehavior,
// } from "@autumn/shared";
// import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
// import { ExtendedRequest } from "@/utils/models/Request.js";

// export const handleUnifiedAttach = async ({
//   req,
//   attachParams,
//   config,
// }: {
//   req: ExtendedRequest;
//   attachParams: AttachParams;
//   config: AttachConfig;
// }) => {
//   // 1. Get upcoming item sets, and current subscriptions
//   const itemSets = await getStripeSubItems({
//     attachParams,
//     carryExistingUsages: config.carryUsage,
//   });

//   const currentSubs = await getCurrentSubs({
//     db: req.db,
//     attachParams,
//   });

//   // 2. Create invoice items for prorations
// };

// Expire old cus product
// Create new full cus product
// Insert new invoices

// export const updateSubsDiffInt = async ({
//   req,
//   stripeCli,
//   curCusProduct,
//   attachParams,
//   stripeSubs,
//   config,
// }: {
//   req: ExtendedRequest;
//   stripeCli: Stripe;
//   curCusProduct: FullCusProduct;
//   attachParams: AttachParams;
//   stripeSubs: Stripe.Subscription[];
//   config: AttachConfig;
// }) => {
//   const { db, logger } = req;
//   const itemSets = await getStripeSubItems({
//     attachParams,
//     carryExistingUsages: config.carryUsage,
//   });

//   // let trialEnd = config.disableTrial
//   //   ? undefined
//   //   : freeTrialToStripeTimestamp({
//   //       freeTrial: attachParams.freeTrial,
//   //       now: attachParams.now,
//   //     });

//   // 1. Create prorations for fixed price items
//   const subToNewItems: any = [];

//   for (const sub of stripeSubs) {
//     const itemSet = itemSets.find((itemSet) =>
//       intervalsSame({
//         intervalA: itemSet,
//         intervalB: subToAutumnInterval(sub),
//       })
//     );

//     const { newItems, shouldCancel } = mergeWithCurItems({
//       sub,
//       itemSet,
//       curCusProduct,
//     });

//     subToNewItems.push({
//       sub,
//       newItems,
//       shouldCancel,
//     });

//     if (newItems.length == 0) continue;

//     if (shouldCancel) {
//       const preview = await stripeCli.invoices.createPreview({
//         subscription: sub.id,
//         subscription_details: {
//           cancel_now: true,
//         },
//       });

//       for (const lineItem of preview.lines.data) {
//         await stripeCli.invoiceItems.create({
//           customer: attachParams.customer.processor.id,
//           amount: lineItem.amount,
//           currency: lineItem.currency,
//           description: lineItem.description || "",
//         });
//       }
//     } else {
//       const [originalPreview, previewInvoice] = await Promise.all([
//         stripeCli.invoices.createPreview({
//           subscription: sub.id,
//         }),
//         stripeCli.invoices.createPreview({
//           subscription: sub.id,
//           subscription_details: {
//             items: newItems,
//           },
//         }),
//       ]);

//       for (const lineItem of previewInvoice.lines.data) {
//         const inCurItems = originalPreview.lines.data.find(
//           (i) => i.id == lineItem.id
//         );

//         if (!inCurItems) {
//           // console.log(lineItem.description, lineItem.amount);
//           // prorationItems.push();
//           await stripeCli.invoiceItems.create({
//             customer: attachParams.customer.processor.id,
//             amount: lineItem.amount,
//             currency: lineItem.currency,
//             description: lineItem.description || "",
//           });
//         }
//       }
//     }
//   }

//   for (const subToNewItem of subToNewItems) {
//     console.log(`Sub to new item`);
//     console.log(`Sub ID: ${subToNewItem.sub.id}`);
//     console.log(`New items: ${JSON.stringify(subToNewItem.newItems)}`);
//     console.log(`Should cancel: ${subToNewItem.shouldCancel}`);
//     console.log(`--------------------------------`);
//   }
//   throw new Error("Stop");

//   // 2. Create prorations for single use items
//   let { invoiceItems, cusEntIds } = await createUsageInvoiceItems({
//     db,
//     attachParams,
//     cusProduct: curCusProduct,
//     stripeSubs,
//     logger,
//   });

//   // Create any new subs
//   const createItemSets = itemSets.filter((itemSet) => {
//     return !stripeSubs.some((sub) =>
//       intervalsSame({
//         intervalA: itemSet,
//         intervalB: subToAutumnInterval(sub),
//       })
//     );
//   });

//   const updatedSubs = [];
//   const invoices = [];

//   // 1. Create new subscriptions
//   for (const itemSet of createItemSets) {
//     const newSub = await createStripeSub({
//       db,
//       attachParams,
//       itemSet,
//     });

//     updatedSubs.push(newSub);
//     invoices.push(newSub.latest_invoice as Stripe.Invoice);
//   }

//   // 2. Update or cancel old subs
//   for (const newItemSet of subToNewItems) {
//     if (newItemSet.shouldCancel) {
//       await stripeCli.subscriptions.cancel(newItemSet.sub.id, {
//         prorate: false,
//         cancellation_details: {
//           comment: "autumn_upgrade",
//         },
//       });
//     } else {
//       const intervalConfig = subToAutumnInterval(newItemSet.sub);
//       const { updatedSub, latestInvoice } = await updateStripeSub({
//         req,
//         attachParams,
//         config: {
//           ...config,
//           proration: ProrationBehavior.None,
//         },
//         stripeSubs: [newItemSet.sub],
//         itemSet: {
//           items: newItemSet.newItems,
//           interval: intervalConfig.interval,
//           intervalCount: intervalConfig.intervalCount,
//         } as any,
//         intervalConfig: subToAutumnInterval(newItemSet.sub),
//       });

//       updatedSubs.push(updatedSub!);
//       if (latestInvoice) {
//         invoices.push(latestInvoice);
//       }
//     }
//   }

//   return {
//     newSubs: stripeSubs,
//     invoices,
//     // invoice: latestInvoice,
//     // newInvoiceIds,
//   };
// };

// 2. Update / cancel old subscriptions

// // 3. Update current subscription
// logger.info("1.2: Updating current subscription");
// const { updatedSub, latestInvoice } = await updateStripeSub({
//   req,
//   attachParams,
//   config,
//   trialEnd,
//   itemSet: firstItemSet,
//   stripeSubs: [firstSub],
// });

// await resetUsageBalances({
//   db,
//   cusEntIds,
//   cusProduct: curCusProduct,
// });

// let newSubs = [updatedSub!];
// const newInvoiceIds = latestInvoice ? [latestInvoice.id] : [];

// // 4. Update current sub schedules if exist...
// logger.info("1.3 Updating current sub schedules");
// await updateCurSchedules({
//   db,
//   stripeCli,
//   curCusProduct,
//   attachParams,
//   itemSets,
//   logger,
// });

// // 5. Cancel other subscriptions
// for (const sub of stripeSubs.slice(1)) {
//   logger.info(`1.4: canceling additional sub: ${sub.id}`);

//   // Filter out
//   await stripeCli.subscriptions.cancel(sub.id, {
//     prorate: true,
//     cancellation_details: {
//       comment: "autumn_upgrade",
//     },
//   });
// }

// // 6. Create subs for other intervals
// for (const itemSet of itemSets.slice(1)) {
//   const newSub = await createStripeSub({
//     db,
//     stripeCli,
//     customer: attachParams.customer,
//     org: attachParams.org,
//     itemSet,
//     invoiceOnly: attachParams.invoiceOnly || false,
//     freeTrial: attachParams.freeTrial,
//     // anchorToUnix: updatedSub!.current_period_end! * 1000,
//     now: attachParams.now,
//   });

//   newSubs.push(newSub);
//   const latestInvoice = newSub.latest_invoice as Stripe.Invoice;
//   newInvoiceIds.push(latestInvoice.id);
// }

// const firstSub = stripeSubs?.[0];
// const firstItemSet = itemSets?.[0];

// await addSubItemsToRemove({
//   sub: firstSub,
//   cusProduct: curCusProduct,
//   itemSet: firstItemSet,
// });

// throw new Error("Stop");
