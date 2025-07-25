import { resetCustomerEntitlement } from "@/cron/cronUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { cusProductToCusEnt } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { Customer } from "@autumn/shared";
import { TestFeature } from "tests/setup/v2Features.js";

export const resetAndGetCusEnt = async ({
  db,
  customer,
  productGroup,
  featureId,
}: {
  db: DrizzleCli;
  customer: Customer;
  productGroup: string;
  featureId: string;
}) => {
  // Run reset cusEnt on ...
  let mainCusProduct = await getMainCusProduct({
    db,
    internalCustomerId: customer.internal_id,
    productGroup,
  });

  let cusEnt = cusProductToCusEnt({
    cusProduct: mainCusProduct!,
    featureId,
  });

  await resetCustomerEntitlement({
    db,
    cusEnt: cusEnt!,
  });

  mainCusProduct = await getMainCusProduct({
    db,
    internalCustomerId: customer.internal_id,
    productGroup,
  });

  cusEnt = cusProductToCusEnt({
    cusProduct: mainCusProduct!,
    featureId,
  });

  return cusEnt;
};
