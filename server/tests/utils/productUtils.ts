import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { Product, ProductV2 } from "@autumn/shared";

export const createProduct = async ({
  autumn,
  product,
  prefix,
}: {
  autumn: AutumnInt;
  product: any;
  prefix?: string;
}) => {
  try {
    await autumn.products.delete(product.id);
  } catch (error) {}

  let clone = structuredClone(product);
  if (typeof clone.items === "object") {
    clone.items = Object.values(clone.items);
  }

  if (prefix) {
    clone.id = `${prefix}_${clone.id}`;
    clone.name = `${prefix} ${clone.name}`;
  }

  await autumn.products.create(clone);
};
export const createProducts = async ({
  autumn,
  products,
  prefix,
}: {
  autumn: AutumnInt;
  products: any[];
  prefix?: string;
}) => {
  const batchCreate = [];
  for (const product of products) {
    batchCreate.push(createProduct({ autumn, product, prefix }));
  }

  await Promise.all(batchCreate);
};
