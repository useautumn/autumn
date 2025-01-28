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

export const handleAddFreeProduct = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
}) => {
  const { customer, product, prices, entitlements, optionsList } = attachParams;

  console.log(`Adding free product ${product.name} to customer ${customer.id}`);

  // 1. Just add product and entitlements
  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: undefined,
    billLaterOnly: false,
  });

  console.log(
    `Successfully added free product ${product.name} to customer ${customer.id}`
  );

  res.status(200).json({ success: true });
};
