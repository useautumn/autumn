import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachConfig, FullCusProduct, Replaceable } from "@autumn/shared";
import { addSubItemsToRemove } from "../attachFuncUtils.js";
import { updateStripeSub } from "../../attachUtils/updateStripeSub/updateStripeSub.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import Stripe from "stripe";
import { getContUseInvoiceItems } from "../../attachUtils/getContUseItems/getContUseInvoiceItems.js";
import RecaseError from "@/utils/errorUtils.js";

export const updateSubsByInt = async ({
  req,
  curCusProduct,
  attachParams,
  config,
  stripeSubs,
}: {
  req: ExtendedRequest;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  config: AttachConfig;
  stripeSubs: Stripe.Subscription[];
}) => {
  const { db, logtail: logger } = req;

  let { replaceables, newItems } = await getContUseInvoiceItems({
    attachParams,
    cusProduct: curCusProduct!,
    stripeSubs,
    logger,
  });

  attachParams.replaceables = replaceables;

  // logger.info(`Cont use items`);
  // logger.info(
  //   `New items: `,
  //   newItems.map(
  //     (item) => `${item.description} | Amount: ${item.amount || item.price}`,
  //   ),
  // );
  // logger.info(
  //   "Replaceables: ",
  //   replaceables.map((r) => `${r.ent.feature_id}`),
  // );

  const itemSets = await getStripeSubItems({ attachParams });
  const invoices: Stripe.Invoice[] = [];

  // const replaceables: Replaceable[] = [];
  for (const sub of stripeSubs) {
    // req.traceroot.info("Testing traceroot!");
    let interval = subToAutumnInterval(sub);

    let itemSet = itemSets.find((itemSet) => itemSet.interval === interval)!;
    await addSubItemsToRemove({
      sub,
      cusProduct: curCusProduct,
      itemSet,
    });

    const { latestInvoice } = await updateStripeSub({
      db,
      attachParams,
      config,
      stripeSubs: [sub],
      itemSet,
      logger,
      interval,
    });

    if (latestInvoice) {
      invoices.push(latestInvoice);
    }

    logger.info(`Updated sub ${sub.id}, interval ${interval}`);
  }

  const batchInvUpdate = [];
  for (const invoice of invoices) {
    batchInvUpdate.push(
      insertInvoiceFromAttach({
        db,
        attachParams,
        stripeInvoice: invoice,
        logger,
      })
    );
  }

  return { replaceables };
};
