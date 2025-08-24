import { createFullCusProduct } from "../../../add-product/createFullCusProduct.js";

import {
  AttachParams,
  AttachResultSchema,
} from "../../../cusProducts/AttachParams.js";
import { APIVersion, AttachBranch, AttachConfig } from "@autumn/shared";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { SuccessCode } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { handlePaidProduct } from "./handlePaidProduct.js";
import { attachParamsToCurCusProduct } from "../../attachUtils/convertAttachParams.js";
import { getDefaultAttachConfig } from "../../attachUtils/getAttachConfig.js";
import { getMergeCusProduct } from "./getMergeCusProduct.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";

export const handleAddProduct = async ({
  req,
  res,
  attachParams,
  config,
  branch,
}: {
  req: ExtendedRequest;
  res?: any;
  attachParams: AttachParams;
  config?: AttachConfig;
  branch?: AttachBranch;
}) => {
  const logger = req.logtail;
  const { customer, products, prices } = attachParams;

  const defaultConfig: AttachConfig = getDefaultAttachConfig();

  // 1. If paid product

  if (prices.length > 0) {
    await handlePaidProduct({
      req,
      res,
      attachParams,
      config: config || defaultConfig,
    });

    return;
  }

  logger.info("Inserting free product in handleAddProduct");

  const batchInsert = [];

  const { mergeCusProduct, mergeSub } = await getMergeCusProduct({
    attachParams,
    config: config || defaultConfig,
    products,
  });

  // console.log("Free trial:", attachParams.freeTrial);
  // throw new Error("test");

  for (const product of products) {
    let curCusProduct = attachParamsToCurCusProduct({ attachParams });
    let anchorToUnix = undefined;

    if (curCusProduct && config?.branch == AttachBranch.NewVersion) {
      anchorToUnix = curCusProduct.created_at;
    }

    if (mergeSub) {
      const { end } = subToPeriodStartEnd({ sub: mergeSub });
      anchorToUnix = end * 1000;
    }

    // Expire previous product

    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        billLaterOnly: true,
        carryExistingUsages: config?.carryUsage || false,
        anchorToUnix,
        logger,
      })
    );
  }
  await Promise.all(batchInsert);

  logger.info("Successfully created full cus product");

  if (res) {
    let apiVersion = attachParams.org.api_version || APIVersion.v1;
    const productNames = products.map((p) => p.name).join(", ");
    const customerName = customer.name || customer.email || customer.id;
    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          success: true,
          code: SuccessCode.FreeProductAttached,
          message: `Successfully attached ${productNames} to ${customerName}`,
          product_ids: products.map((p) => p.id),
          customer_id: customer.id || customer.internal_id,
        })
      );
    } else {
      res.status(200).json({
        success: true,
      });
    }
  }
};
