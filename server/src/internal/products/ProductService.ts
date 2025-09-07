import {
  type AppEnv,
  customerProducts,
  customers,
  ErrCode,
  entitlements,
  type FullProduct,
  freeTrials,
  type Product,
  prices,
  products,
} from "@autumn/shared";
import { and, desc, eq, exists, inArray, ne, or, sql } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { getLatestProducts } from "./productUtils.js";

const parseFreeTrials = ({
  products,
  product,
}: {
  products?: FullProduct[];
  product?: FullProduct;
}) => {
  if (products) {
    for (const prod of products) {
      prod.free_trial =
        prod.free_trials && prod.free_trials.length > 0
          ? prod.free_trials[0]
          : null;
    }
  } else if (product) {
    product!.free_trial =
      product!.free_trials && product!.free_trials.length > 0
        ? product!.free_trials[0]
        : null;
  }
  return product;
};

// biome-ignore lint/complexity/noStaticOnlyClass: no thanks m8
export class ProductService {
  static async getByFeature({
    db,
    internalFeatureId,
  }: {
    db: DrizzleCli;
    internalFeatureId: string;
  }) {
    const fullProducts = (await db.query.products.findMany({
      where: exists(
        db
          .select()
          .from(entitlements)
          .where(
            and(
              eq(entitlements.internal_product_id, products.internal_id),
              eq(entitlements.internal_feature_id, internalFeatureId)
            )
          )
      ),
      with: {
        entitlements: {
          with: {
            feature: true,
          },
        },
        prices: { where: eq(prices.is_custom, false) },
        free_trials: { where: eq(freeTrials.is_custom, false) },
      },
      orderBy: [desc(products.version)],
    })) as FullProduct[];

    parseFreeTrials({ products: fullProducts });

    const latestProducts = getLatestProducts(fullProducts);

    return latestProducts;
  }

  static async getByInternalId({
    db,
    internalId,
  }: {
    db: DrizzleCli;
    internalId: string;
  }) {
    return (await db.query.products.findFirst({
      where: eq(products.internal_id, internalId),
    })) as Product;
  }

  static async listByInternalIds({
    db,
    internalIds,
  }: {
    db: DrizzleCli;
    internalIds: string[];
  }) {
    return (await db.query.products.findMany({
      where: inArray(products.internal_id, internalIds),
      with: {
        entitlements: {
          with: {
            feature: true,
          },
        },
        prices: { where: eq(prices.is_custom, false) },
      },
    })) as FullProduct[];
  }

  static async listDefault({
    db,
    orgId,
    env,
    group,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
    group?: string;
  }) {
    const prods = (await db.query.products.findMany({
      where: and(
        eq(products.org_id, orgId),
        eq(products.env, env),
        eq(products.is_default, true),
        ne(products.archived, true),
        group ? eq(products.group, group) : undefined
      ),
      with: {
        entitlements: {
          with: {
            feature: true,
          },
          where: eq(entitlements.is_custom, false),
        },
        prices: { where: eq(prices.is_custom, false) },
        free_trials: { where: eq(freeTrials.is_custom, false) },
      },
    })) as FullProduct[];

    parseFreeTrials({ products: prods });

    const latestProducts = getLatestProducts(prods);

    return latestProducts as FullProduct[];
  }

  static async insert({ db, product }: { db: DrizzleCli; product: Product }) {
    const prod = await db.insert(products).values(product).returning();

    if (!prod || prod.length === 0) {
      throw new RecaseError({
        message: "Failed to create product",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      });
    }

    return prod[0] as Product;
  }

  static async get({
    db,
    id,
    orgId,
    env,
    version,
  }: {
    db: DrizzleCli;
    id: string;
    orgId: string;
    env: AppEnv;
    version?: number;
  }) {
    const data = await db.query.products.findMany({
      where: and(
        eq(products.id, id),
        eq(products.org_id, orgId),
        eq(products.env, env),
        version ? eq(products.version, version) : undefined
      ),
      orderBy: [desc(products.version)],
    });

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  }

  static async listFull({
    db,
    orgId,
    env,
    inIds,
    returnAll = false,
    version,
    excludeEnts = false,
    archived,
    includeAll = false,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
    inIds?: string[];
    returnAll?: boolean;
    version?: number;
    excludeEnts?: boolean;
    archived?: boolean;
    includeAll?: boolean;
  }) {
    const data = (await db.query.products.findMany({
      where: and(
        eq(products.org_id, orgId),
        eq(products.env, env),
        inIds ? inArray(products.id, inIds) : undefined,
        version ? eq(products.version, version) : undefined
      ),

      with: {
        entitlements: excludeEnts
          ? undefined
          : {
              with: {
                feature: true,
              },
              where: eq(entitlements.is_custom, false),
            },
        prices: { where: eq(prices.is_custom, false) },
        free_trials: { where: eq(freeTrials.is_custom, false) },
      },
      orderBy: [desc(products.internal_id)],
    })) as FullProduct[];

    parseFreeTrials({ products: data });

    if (returnAll) {
      return data;
    }

    const latestProducts: FullProduct[] = getLatestProducts(data);

    if (inIds) {
      const newProducts: FullProduct[] = [];
      for (const id of inIds) {
        const prod = latestProducts.find((prod) => prod.id === id);
        if (!prod) {
          throw new RecaseError({
            message: `Product ${id} not found`,
            code: ErrCode.ProductNotFound,
            statusCode: StatusCodes.NOT_FOUND,
          });
        }
        newProducts.push(prod);
      }
      return newProducts;
    }

    if (notNullish(archived)) {
      return latestProducts.filter((p) => p.archived === archived);
    }

    return latestProducts as FullProduct[];
  }

  static async getFull({
    db,
    idOrInternalId,
    orgId,
    env,
    version,
    allowNotFound = false,
  }: {
    db: DrizzleCli;
    idOrInternalId: string;
    orgId: string;
    env: AppEnv;
    version?: number;
    allowNotFound?: boolean;
  }) {
    const data = (await db.query.products.findFirst({
      where: and(
        or(
          eq(products.id, idOrInternalId),
          eq(products.internal_id, idOrInternalId)
        ),
        eq(products.org_id, orgId),
        eq(products.env, env),
        version ? eq(products.version, version) : undefined
      ),
      orderBy: [desc(products.version)],
      with: {
        entitlements: {
          with: {
            feature: true,
          },
          where: eq(entitlements.is_custom, false),
        },
        prices: { where: eq(prices.is_custom, false) },
        free_trials: { where: eq(freeTrials.is_custom, false) },
      },
    })) as FullProduct;

    parseFreeTrials({ product: data });

    if (!data) {
      if (allowNotFound) return null as unknown as FullProduct;
      throw new RecaseError({
        message: `Product ${idOrInternalId} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    return data as FullProduct;
  }

  static async getProductVersionCount({
    db,
    productId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const data = await db.query.products.findMany({
      columns: {
        version: true,
      },
      limit: 1,
      where: and(
        eq(products.id, productId),
        eq(products.org_id, orgId),
        eq(products.env, env)
      ),
      orderBy: [desc(products.version)],
    });

    if (data.length === 0) {
      throw new RecaseError({
        message: `Product ${productId} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    return data[0].version;
  }

  // UPDATES
  static async updateByInternalId({
    db,
    internalId,
    update,
  }: {
    db: DrizzleCli;
    internalId: string;
    update: any;
  }) {
    await db
      .update(products)
      .set(update)
      .where(eq(products.internal_id, internalId));
  }

  // DELETES

  static async deleteByInternalId({
    db,
    internalId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    internalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    await db
      .delete(products)
      .where(
        and(
          eq(products.internal_id, internalId),
          eq(products.org_id, orgId),
          eq(products.env, env)
        )
      );
  }

  static async deleteByProductId({
    db,
    productId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const res = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.org_id, orgId),
          eq(products.env, env)
        )
      );

    const internalIds = res.map((r) => r.internal_id);

    if (internalIds.length === 0) return;
    if (internalIds.length > 500) {
      throw new RecaseError({
        message: "Cannot delete more than 500 products at once",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      });
    }

    await db.delete(products).where(inArray(products.internal_id, internalIds));
  }

  static async deleteByOrgId({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
  }) {
    await db
      .delete(products)
      .where(and(eq(products.org_id, orgId), eq(products.env, env)));
  }

  static async getDeletionText({
    db,
    productId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const internalProductIds = (
      await db
        .select({
          internal_product_id: products.internal_id,
        })
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.org_id, orgId),
            eq(products.env, env)
          )
        )
    ).map((r) => r.internal_product_id);

    const res = await db
      .select({
        internal_customer_id: customerProducts.internal_customer_id,
        name: customers.name,
        id: customers.id,
        email: customers.email,
        totalCount: sql<number>`COUNT(*) OVER ()`,
      })
      .from(customerProducts)
      .innerJoin(
        customers,
        eq(customerProducts.internal_customer_id, customers.internal_id)
      )
      .where(
        and(
          inArray(customerProducts.internal_product_id, internalProductIds),
          eq(customers.env, env),
          eq(customers.org_id, orgId)
        )
      )
      .orderBy(desc(customers.created_at))
      .groupBy(
        customerProducts.internal_customer_id,
        customers.name,
        customers.created_at,
        customers.id,
        customers.email
      );
    // .limit(1);

    return res;
  }
}
