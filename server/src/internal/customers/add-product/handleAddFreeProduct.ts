import { APIVersion, AttachScenario } from "@autumn/shared";

import { createFullCusProduct } from "./createFullCusProduct.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../cusProducts/AttachParams.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { SuccessCode } from "@autumn/shared";

export const handleAddFreeProduct = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const logger = req.logtail;
  const { customer, products } = attachParams;

  console.log(
    `Adding free product(s) ${products.map(
      (product) => product.name,
    )} to customer ${customer.id}`,
  );

  // 1. Just add product and entitlements
  for (const product of products) {
    await createFullCusProduct({
      db: req.db,
      attachParams: attachToInsertParams(attachParams, product),
      subscriptionId: undefined,
      billLaterOnly: false,
      logger,
    });
  }

  let apiVersion = attachParams.apiVersion || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        customer_id: customer.id || customer.internal_id,
        product_ids: products.map((p) => p.id),
        code: SuccessCode.FreeProductAttached,
        message: `Successfully attached free product(s) -- ${products
          .map((p) => p.name)
          .join(", ")}`,
        scenario: AttachScenario.New,
      }),
    );
  } else {
    res.status(200).json({ success: true });
  }
};
