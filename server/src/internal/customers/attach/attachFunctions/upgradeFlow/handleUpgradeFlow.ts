import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
  paramsToCurSub,
} from "../../attachUtils/convertAttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { APIVersion, AttachConfig, CusProductStatus } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
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

  const newSubItems = await removeCurCusProductItems({
    sub: curSub,
    cusProduct: curCusProduct!,
    subItems: itemSet.subItems,
  });

  if (newSubItems.length > 0) {
    itemSet.subItems = newSubItems;

    logger.info(`1. Updating subs with new items`);
    const res = await updateStripeSub2({
      req,
      attachParams,
      config,
      curSub: curSub!,
      itemSet,
    });

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
