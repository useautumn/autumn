import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  attachParamsToCurCusProduct,
  paramsToCurSub,
  paramsToCurSubSchedule,
} from "../../attachUtils/convertAttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import {
  APIVersion,
  AttachBranch,
  AttachConfig,
  CusProductStatus,
  ProrationBehavior,
} from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";

import {
  attachToInvoiceResponse,
  insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { updateStripeSub2 } from "./updateStripeSub2.js";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { shouldCancelSub } from "./upgradeFlowUtils.js";
import { handleUpgradeFlowSchedule } from "./handleUpgradeFlowSchedule.js";

export const handleUpgradeFlow = async ({
  req,
  res,
  attachParams,
  config,
  branch,
}: {
  req: ExtendedRequest;
  res?: any;
  attachParams: AttachParams;
  config: AttachConfig;
  branch: AttachBranch;
}) => {
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });
  const curSub = await paramsToCurSub({ attachParams });

  const logger = req.logtail;

  if (curCusProduct?.api_version) {
    attachParams.apiVersion = curCusProduct.api_version;
  }

  let sub = curSub;
  let latestInvoice = undefined;

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  const newItemSet = await paramsToSubItems({
    req,
    sub: curSub,
    attachParams,
    config,
  });

  const { subItems } = newItemSet;

  // Delete scheduled products if needed
  for (const product of attachParams.products) {
    if (product.is_add_on) continue;

    const { curScheduledProduct } = getExistingCusProducts({
      product,
      cusProducts: attachParams.cusProducts,
      internalEntityId: attachParams.internalEntityId,
    });

    if (curScheduledProduct) {
      await CusProductService.delete({
        db: req.db,
        cusProductId: curScheduledProduct.id,
      });
    }
  }

  let canceled = false;
  // SCENARIO 1, NO SUB:

  // Don't really need this...
  if (branch == AttachBranch.SameCustomEnts) {
    config.proration = ProrationBehavior.None;
  }

  if (!curSub) {
    logger.info("UPGRADE FLOW: no sub (from cancel maybe...?)");
    // Do something about current sub...
  } else if (shouldCancelSub({ sub: curSub!, newSubItems: subItems })) {
    logger.info(
      `UPGRADE FLOW: canceling sub ${curSub!.id}, proration: ${config.proration}`
    );
    canceled = true;
    const { stripeCli } = attachParams;
    await stripeCli.subscriptions.cancel(curSub!.id, {
      prorate: config.proration == ProrationBehavior.Immediately,
      invoice_now: config.proration == ProrationBehavior.Immediately,
      cancellation_details: {
        comment: "autumn_cancel",
      },
    });
  } else if (subItems.length > 0) {
    logger.info(`UPGRADE FLOW, updating sub ${curSub!.id}`);
    itemSet.subItems = subItems;

    const res = await updateStripeSub2({
      req,
      attachParams,
      config,
      curSub: curSub!,
      itemSet,
      fromCreate: attachParams.products.length === 0, // just for now, if no products, it comes from cancel product...
    });

    if (res?.latestInvoice) {
      logger.info(`UPGRADE FLOW: inserting invoice ${res.latestInvoice.id}`);
      await insertInvoiceFromAttach({
        db: req.db,
        attachParams,
        stripeInvoice: res.latestInvoice,
        logger,
      });
    }

    const schedule = await paramsToCurSubSchedule({ attachParams });

    if (schedule) {
      await handleUpgradeFlowSchedule({
        req,
        logger,
        attachParams,
        config,
        schedule,
        curSub,
      });
    }

    attachParams.replaceables = res.replaceables || [];
    sub = res.updatedSub;
    latestInvoice = res.latestInvoice;
  }

  logger.info(`UPGRADE FLOW: expiring previous cus product`);
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct!.id,
    updates: {
      subscription_ids: canceled ? undefined : [],
      status: CusProductStatus.Expired,
    },
  });

  if (attachParams.products.length > 0) {
    logger.info(`UPGRADE FLOW: creating new cus product`);
    const anchorToUnix = sub ? getEarliestPeriodEnd({ sub }) * 1000 : undefined;
    await createFullCusProduct({
      db: req.db,
      attachParams: attachToInsertParams(
        attachParams,
        attachParams.products[0]
      ),
      subscriptionIds: curCusProduct!.subscription_ids || [],
      disableFreeTrial: config.disableTrial,
      carryExistingUsages: config.carryUsage,
      carryOverTrial: config.carryTrial,
      anchorToUnix: anchorToUnix,
      logger,
    });
  }

  if (res) {
    let apiVersion = attachParams.org.api_version || APIVersion.v1;
    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          customer_id: attachParams.customer.id,
          product_ids: attachParams.products.map((p) => p.id),
          // invoice: attachParams.invoiceOnly
          //   ? attachToInvoiceResponse({ invoice: invoices?.[0] })
          //   : undefined,
          invoice: attachParams.invoiceOnly
            ? attachToInvoiceResponse({ invoice: latestInvoice || undefined })
            : undefined,
          code: "updated_product_successfully",
          message: `Successfully updated product`,
        })
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully updated product`,
      });
    }
  }
};
