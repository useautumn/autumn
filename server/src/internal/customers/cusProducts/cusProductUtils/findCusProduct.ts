import { DrizzleCli } from "@/db/initDrizzle.js";
import { FullCusProduct, FullCustomer } from "@autumn/shared";
import { ACTIVE_STATUSES, CusProductService } from "../CusProductService.js";

export const getActiveCusProduct = ({
  fullCus,
  cusProducts,
  productId,
}: {
  fullCus?: FullCustomer;
  cusProducts?: FullCusProduct[];
  productId: string;
}) => {
  if (fullCus) {
    return fullCus.customer_products.find(
      (cusProduct: FullCusProduct) =>
        cusProduct.product.id === productId &&
        ACTIVE_STATUSES.includes(cusProduct.status)
    );
  }

  return undefined;
};

export const findCusProductById = async ({
  db,
  internalCustomerId,
  productId,
}: {
  db: DrizzleCli;
  internalCustomerId: string;
  productId: string;
}) => {
  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId,
  });

  return cusProducts.find(
    (cusProduct: FullCusProduct) => cusProduct.product.id === productId
  );
};
