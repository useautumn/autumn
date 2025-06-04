import { createFullCusProduct } from "../../../add-product/createFullCusProduct.js";

import {
  AttachParams,
  AttachResultSchema,
} from "../../../cusProducts/AttachParams.js";
import { APIVersion, AttachConfig } from "@autumn/shared";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { SuccessCode } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { handlePaidProduct } from "./handlePaidProduct.js";

export const handleAddProduct = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: ExtendedRequest;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const logger = req.logtail;
  const { customer, products, prices } = attachParams;

  // 1. If paid product
  if (prices.length > 0) {
    await handlePaidProduct({
      req,
      res,
      attachParams,
      config,
    });

    return;
  }

  logger.info("Inserting free product in handleAddProduct");

  const batchInsert = [];

  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionId: undefined,
        billLaterOnly: true,
        carryExistingUsages: config.carryUsage,
        logger,
      }),
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
          customer_id: customer.id,
        }),
      );
    } else {
      res.status(200).json({
        success: true,
      });
    }
  }
};
