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

export const handleAddFreeProduct = async ({
  req,
  res,
  customer,
  product,
  org,
  env,
  prices,
  entitlements,
  optionsList,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  org: Organization;
  env: AppEnv;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
}) => {
  console.log(`Adding free product ${product.name} to customer ${customer.id}`);

  // 1. Just add product and entitlements
  await createFullCusProduct({
    sb: req.sb,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
  });

  console.log(
    `Successfully added free product ${product.name} to customer ${customer.id}`
  );

  res.status(200).json({ success: true });
};
