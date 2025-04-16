import { Autumn } from "@/external/autumn/autumnCli.js";
import { Product, ProductV2 } from "@autumn/shared";

export const createProduct = async ({
  autumn,
  product,
}: {
  autumn: Autumn;
  product: any;
}) => {
  try {
    await autumn.products.delete(product.id);
  } catch (error) {}

  await autumn.products.create(product);

  let clone = structuredClone(product);
  if (typeof clone.items === "object") {
    clone.items = Object.values(clone.items);
  }

  await autumn.products.update(product.id, clone);
};
