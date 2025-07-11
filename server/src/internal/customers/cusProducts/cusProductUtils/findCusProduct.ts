import { DrizzleCli } from "@/db/initDrizzle.js";
import { FullCusProduct } from "@autumn/shared";
import { CusProductService } from "../CusProductService.js";

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
