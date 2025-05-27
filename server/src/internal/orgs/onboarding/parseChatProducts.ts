import { DrizzleCli } from "@/db/initDrizzle.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemInitUtils.js";
import { constructProduct } from "@/internal/products/productUtils.js";
import {
  AppEnv,
  CreateProductSchema,
  EntInsertSchema,
  Entitlement,
  Feature,
  Price,
  Product,
  ProductV2,
} from "@autumn/shared";

export const parseChatProducts = async ({
  db,
  logger,
  features,
  orgId,
  chatProducts,
}: {
  db: DrizzleCli;
  logger: any;
  features: Feature[];
  orgId: string;
  chatProducts: ProductV2[];
}) => {
  let products: Product[] = [];

  let allPrices: Price[] = [];
  let allEnts: Entitlement[] = [];

  for (const product of chatProducts) {
    let backendProduct: Product = constructProduct({
      productData: CreateProductSchema.parse({
        ...product,
      }),
      orgId,
      env: AppEnv.Sandbox,
    });

    let { prices, entitlements } = await handleNewProductItems({
      db,
      curPrices: [],
      curEnts: [],
      newItems: product.items,
      product: backendProduct,
      features,
      saveToDb: false,
      isCustom: false,
      logger,
    });

    products.push(backendProduct);
    allPrices.push(...prices);

    allEnts.push(
      ...entitlements.map((ent) => {
        return EntInsertSchema.parse(ent) as unknown as Entitlement;
      }),
    );
  }

  return { products, prices: allPrices, ents: allEnts };
};
