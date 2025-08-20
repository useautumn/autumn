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
import { APIVersion, AttachConfig, CusProductStatus } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";

import {
  attachToInvoiceResponse,
  insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { updateStripeSub2 } from "./updateStripeSub2.js";
import { removeCurCusProductItems } from "../../attachUtils/attachUtils.js";
import {
  getEarliestPeriodEnd,
  subToPeriodStartEnd,
} from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { paramsToScheduleItems } from "../../mergeUtils/paramsToScheduleItems.js";
import { updateCurSchedule } from "../../mergeUtils/updateCurSchedule.js";

export const handleUpgradeFlow = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: ExtendedRequest;
  res?: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const { stripeCli } = attachParams;
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
    sub: curSub!,
    attachParams,
    config,
  });

  const { subItems } = newItemSet;

  if (subItems.length > 0) {
    itemSet.subItems = subItems;

    logger.info(`1. Updating subs with new items`);

    const res = await updateStripeSub2({
      req,
      attachParams,
      config,
      curSub: curSub!,
      itemSet,
    });

    const schedule = await paramsToCurSubSchedule({ attachParams });

    // Add to schedule?
    if (schedule) {
      const newItems = await paramsToScheduleItems({
        req,
        schedule,
        attachParams,
        config,
        removeCusProducts: [curCusProduct!],
      });

      console.log("UPGRADE FLOW, NEW SCHEDULE ITEMS:", newItems.items);

      await updateCurSchedule({
        req,
        attachParams,
        schedule,
        newItems: newItems.items,
        sub: curSub!,
      });
    }

    attachParams.replaceables = res.replaceables || [];
    sub = res.updatedSub;
    latestInvoice = res.latestInvoice;
  }

  logger.info(`2. Expiring previous cus product`);
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct!.id,
    updates: {
      subscription_ids: [],
      status: CusProductStatus.Expired,
    },
  });

  if (latestInvoice) {
    await insertInvoiceFromAttach({
      db: req.db,
      attachParams,
      stripeInvoice: latestInvoice,
      logger,
    });
  }

  logger.info(`3. Creating new cus product`);
  const anchorToUnix = sub ? getEarliestPeriodEnd({ sub }) * 1000 : undefined;
  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, attachParams.products[0]),
    subscriptionIds: curCusProduct!.subscription_ids || [],
    disableFreeTrial: config.disableTrial,
    carryExistingUsages: config.carryUsage,
    carryOverTrial: config.carryTrial,
    anchorToUnix: anchorToUnix,
    logger,
  });

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

// const newSubItems = await removeCurCusProductItems({
//   sub: curSub,
//   cusProduct: curCusProduct!,
//   subItems: itemSet.subItems,
// });
