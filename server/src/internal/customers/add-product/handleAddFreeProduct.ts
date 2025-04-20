import {
  APIVersion,
  AppEnv,
  Entitlement,
  EntitlementWithFeature,
  Feature,
  FeatureOptions,
  FullProduct,
  Organization,
  Price,
  PricesInput,
} from "@autumn/shared";

import { Customer } from "@autumn/shared";
import { createFullCusProduct } from "./createFullCusProduct.js";
import { AttachParams, AttachResultSchema } from "../products/AttachParams.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { SuccessCode } from "@shared/errors/SuccessCode.js";

export const handleAddFreeProduct = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const { customer, products } = attachParams;

  console.log(
    `Adding free product(s) ${products.map(
      (product) => product.name
    )} to customer ${customer.id}`
  );

  // 1. Just add product and entitlements
  for (const product of products) {
    await createFullCusProduct({
      sb: req.sb,
      attachParams: attachToInsertParams(attachParams, product),
      subscriptionId: undefined,
      billLaterOnly: false,
    });
  }

  let apiVersion = attachParams.org.api_version || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        customer_id: customer.id,
        product_ids: products.map((p) => p.id),
        code: SuccessCode.FreeProductAttached,
        message: `Successfully attached free product(s) -- ${products
          .map((p) => p.name)
          .join(", ")}`,
      })
    );
  } else {
    res.status(200).json({ success: true });
  }
};
