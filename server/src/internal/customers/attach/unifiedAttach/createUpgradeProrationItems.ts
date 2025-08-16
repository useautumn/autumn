import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachConfig, intervalsSame } from "@autumn/shared";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { ItemSet } from "@/utils/models/ItemSet.js";
import { attachParamsToCurCusProduct } from "../attachUtils/convertAttachParams.js";

// 1. Create proration items for fixed prices
const createFixedPriceProrations = async ({
  req,
  attachParams,
  config,
  currentSubs,
  itemSets,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  currentSubs: Stripe.Subscription[];
  config: AttachConfig;
  itemSets: ItemSet[];
}) => {
  const { stripeCli } = attachParams;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  for (const sub of currentSubs) {
    const itemSet = itemSets.find((itemSet) =>
      intervalsSame({
        intervalA: itemSet,
        intervalB: subToAutumnInterval(sub),
      })
    );

    // const { newItems, shouldCancel } = mergeWithCurItems({
    //   sub,
    //   itemSet,
    //   curCusProduct,
    // });
    // subToNewItems.push({
    //   sub,
    //   newItems,
    //   shouldCancel,
    // });

    // if (newItems.length == 0) continue;
    // if (shouldCancel) {
    //   const preview = await stripeCli.invoices.createPreview({
    //     subscription: sub.id,
    //     subscription_details: {
    //       cancel_now: true,
    //     },
    //   });
    //   for (const lineItem of preview.lines.data) {
    //     await stripeCli.invoiceItems.create({
    //       customer: attachParams.customer.processor.id,
    //       amount: lineItem.amount,
    //       currency: lineItem.currency,
    //       description: lineItem.description || "",
    //     });
    //   }
    // } else {
    //   const [originalPreview, previewInvoice] = await Promise.all([
    //     stripeCli.invoices.createPreview({
    //       subscription: sub.id,
    //     }),
    //     stripeCli.invoices.createPreview({
    //       subscription: sub.id,
    //       subscription_details: {
    //         items: newItems,
    //       },
    //     }),
    //   ]);
    //   for (const lineItem of previewInvoice.lines.data) {
    //     const inCurItems = originalPreview.lines.data.find(
    //       (i) => i.id == lineItem.id
    //     );
    //     if (!inCurItems) {
    //       // console.log(lineItem.description, lineItem.amount);
    //       // prorationItems.push();
    //       await stripeCli.invoiceItems.create({
    //         customer: attachParams.customer.processor.id,
    //         amount: lineItem.amount,
    //         currency: lineItem.currency,
    //         description: lineItem.description || "",
    //       });
    //     }
    //   }
    // }
  }
};
