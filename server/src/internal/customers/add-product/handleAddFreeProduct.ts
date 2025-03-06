import {
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
import { AttachParams } from "../products/AttachParams.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";

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

  console.log(`Successfully added free products`);

  res.status(200).json({ success: true });
};
