import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { AppEnv, Product, ProductV2 } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const createProduct = async ({
  db,
  orgId,
  env,
  autumn,
  product,
  prefix,
}: {
  db: DrizzleCli;
  orgId: string;
  env: AppEnv;
  autumn: AutumnInt;
  product: any;
  prefix?: string;
}) => {
  try {
    const products = await ProductService.listFull({
      db,
      orgId,
      env,
      returnAll: true,
      inIds: [product.id],
    });

    const batchDelete = [];
    for (const prod of products) {
      batchDelete.push(
        ProductService.deleteByInternalId({
          db,
          internalId: prod.internal_id,
          orgId,
          env,
        }),
      );
    }

    await Promise.all(batchDelete);
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
  db,
  orgId,
  env,
  autumn,
  products,
  prefix,
  customerId,
}: {
  db: DrizzleCli;
  orgId: string;
  env: AppEnv;
  autumn: AutumnInt;
  products: any[];
  prefix?: string;
  customerId?: string;
}) => {
  if (customerId) {
    try {
      await autumn.customers.delete(customerId);
    } catch (error) {}
  }

  const batchCreate = [];
  for (const product of products) {
    batchCreate.push(
      createProduct({ db, orgId, env, autumn, product, prefix }),
    );
  }

  await Promise.all(batchCreate);
};
