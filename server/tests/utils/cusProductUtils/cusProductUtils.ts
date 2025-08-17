import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AppEnv, CusProductStatus, FullCusProduct } from "@autumn/shared";

export const getMainCusProduct = async ({
  db,
  customerId,
  orgId,
  env,
  productGroup,
}: {
  db: DrizzleCli;
  customerId: string;
  orgId: string;
  env: AppEnv;
  productGroup?: string;
}) => {
  let customer = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId,
    env,
    withEntities: true,
    inStatuses: [CusProductStatus.Active],
  });

  let cusProducts = customer.customer_products;

  let mainCusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) =>
      !cusProduct.product.is_add_on &&
      (productGroup ? cusProduct.product.group === productGroup : true)
  );

  return mainCusProduct;
};
