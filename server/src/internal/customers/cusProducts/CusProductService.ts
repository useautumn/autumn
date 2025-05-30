import { DrizzleCli } from "@/db/initDrizzle.js";

import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProduct,
  CusProductStatus,
  customers,
  ErrCode,
  FullCusProduct,
  products,
} from "@autumn/shared";

import { customerProducts } from "@autumn/shared";

import { and, arrayContains, eq, inArray, or, sql } from "drizzle-orm";

export const ACTIVE_STATUSES = [
  CusProductStatus.Active,
  CusProductStatus.PastDue,
];

export const orgOwnsCusProduct = async ({
  cusProduct,
  orgId,
  env,
}: {
  cusProduct: FullCusProduct;
  orgId: string;
  env: AppEnv;
}) => {
  if (!cusProduct.product) return false;
  let product = cusProduct.product;

  if (product.org_id !== orgId || product.env !== env) {
    return false;
  }

  return true;
};

export const filterByOrgAndEnv = ({
  cusProducts,
  orgId,
  env,
}: {
  cusProducts: FullCusProduct[];
  orgId: string;
  env: AppEnv;
}) => {
  return cusProducts.filter((cusProduct) => {
    if (!cusProduct.product) return false;
    let product = cusProduct.product;

    if (product.org_id !== orgId || product.env !== env) {
      return false;
    }

    return true;
  });
};

const getFullCusProdRelations = () => {
  return {
    customer_entitlements: {
      with: {
        entitlement: {
          with: {
            feature: true as const,
          },
        },
      },
    },
    customer_prices: {
      with: {
        price: true as const,
      },
    },
    free_trial: true as const,
  } as const;
};

export class CusProductService {
  static async getByIdForReset({ db, id }: { db: DrizzleCli; id: string }) {
    let cusProduct = await db.query.customerProducts.findFirst({
      where: eq(customerProducts.id, id),
      with: {
        customer: true,
        product: {
          with: {
            org: true,
          },
        },
      },
    });

    if (!cusProduct) {
      throw new RecaseError({
        message: `Cus product not found: ${id}`,
        code: ErrCode.CusProductNotFound,
        statusCode: 404,
      });
    }

    return cusProduct;
  }

  static async get({
    db,
    id,
    orgId,
    env,
    withCustomer = false,
  }: {
    db: DrizzleCli;
    id: string;
    orgId: string;
    env: AppEnv;
    withCustomer?: boolean;
  }) {
    let cusProduct = (await db.query.customerProducts.findFirst({
      where: eq(customerProducts.id, id),
      with: {
        customer: withCustomer ? true : undefined,
        product: true,
        customer_entitlements: {
          with: {
            entitlement: {
              with: {
                feature: true,
              },
            },
          },
        },
        customer_prices: {
          with: {
            price: true,
          },
        },
        free_trial: true,
      },
    })) as FullCusProduct;

    if (!cusProduct || !orgOwnsCusProduct({ cusProduct, orgId, env })) {
      return null;
    }

    return cusProduct;
  }

  static async insert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: CusProduct[] | CusProduct;
  }) {
    if (Array.isArray(data) && data.length == 0) {
      return;
    }

    await db.insert(customerProducts).values(data as any);
  }

  static async list({
    db,
    internalCustomerId,
    withCustomer = false,
    inStatuses = [
      CusProductStatus.Active,
      CusProductStatus.PastDue,
      CusProductStatus.Scheduled,
    ],
  }: {
    db: DrizzleCli;
    internalCustomerId: string;
    withCustomer?: boolean;
    inStatuses?: string[];
  }) {
    let cusProducts = await db.query.customerProducts.findMany({
      where: and(
        eq(customerProducts.internal_customer_id, internalCustomerId),
        inStatuses ? inArray(customerProducts.status, inStatuses) : undefined,
      ),
      with: {
        customer: withCustomer ? true : undefined,
        product: true,
        customer_entitlements: {
          with: {
            entitlement: {
              with: {
                feature: true,
              },
            },
          },
        },
        customer_prices: {
          with: {
            price: true,
          },
        },
        free_trial: true,
      },
    });

    return cusProducts as FullCusProduct[];
  }

  static async getByInternalProductId({
    db,
    internalProductId,
    limit = 1,
  }: {
    db: DrizzleCli;
    internalProductId: string;
    limit?: number;
  }) {
    let data = await db.query.customerProducts.findMany({
      where: eq(customerProducts.internal_product_id, internalProductId),
      limit,
    });

    return data as CusProduct[];
  }

  static async getByProductId({
    db,
    productId,
    limit = 1,
  }: {
    db: DrizzleCli;
    productId: string;
    limit?: number;
  }) {
    let data = await db
      .select()
      .from(customerProducts)
      .innerJoin(
        products,
        eq(customerProducts.internal_product_id, products.internal_id),
      )
      .where(eq(products.id, productId))
      .limit(1);

    return data.map((d) => ({
      ...d.customer_products,
      product: d.products,
    }));
  }

  static async getByStripeSubId({
    db,
    stripeSubId,
    orgId,
    env,
    inStatuses,
  }: {
    db: DrizzleCli;
    stripeSubId: string;
    orgId: string;
    env: AppEnv;
    inStatuses?: string[];
  }) {
    let data = await db.query.customerProducts.findMany({
      where: (table, { and, or, eq, sql, inArray }) =>
        and(
          or(
            eq(
              sql`${customerProducts.processor}->>'subscription_id'`,
              stripeSubId,
            ),
            sql`${customerProducts.subscription_ids} @> ${sql`ARRAY[${stripeSubId}]`}`,
          ),

          inStatuses ? inArray(customerProducts.status, inStatuses) : undefined,
        ),

      with: {
        product: true,
        customer: true,
        customer_entitlements: {
          with: {
            entitlement: {
              with: {
                feature: true,
              },
            },
          },
        },
        customer_prices: {
          with: {
            price: true,
          },
        },
        free_trial: true,
      },
    });

    let cusProducts = data as FullCusProduct[];

    return filterByOrgAndEnv({
      cusProducts,
      orgId,
      env,
    });
  }

  static async getByStripeScheduledId({
    db,
    stripeScheduledId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    stripeScheduledId: string;
    orgId: string;
    env: AppEnv;
  }) {
    let data = await db.query.customerProducts.findMany({
      where: (customerProducts, { and, or, eq, sql }) =>
        and(
          or(
            eq(
              sql`${customerProducts.processor}->>'subscription_schedule_id'`,
              stripeScheduledId,
            ),
            sql`${customerProducts.scheduled_ids} @> ${sql`ARRAY[${stripeScheduledId}]`}`,
          ),
        ),

      with: {
        product: true,
        customer: true,
        customer_entitlements: {
          with: {
            entitlement: {
              with: {
                feature: true,
              },
            },
          },
        },
        customer_prices: {
          with: {
            price: true,
          },
        },
        free_trial: true,
      },
    });

    let cusProducts = data as FullCusProduct[];

    return filterByOrgAndEnv({
      cusProducts,
      orgId,
      env,
    });
  }

  static async getByScheduleId({
    db,
    scheduleId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    scheduleId: string;
    orgId: string;
    env: AppEnv;
  }) {
    let fullCusProdRelations = {
      customer_entitlements: {
        with: {
          entitlement: {
            with: {
              feature: true as const,
            },
          },
        },
      },
      customer_prices: {
        with: {
          price: true as const,
        },
      },
      free_trial: true as const,
    } as const;

    let data = (await db.query.customerProducts.findMany({
      where: arrayContains(customerProducts.scheduled_ids, [scheduleId]),
      with: {
        product: true,
        customer: true,
        ...fullCusProdRelations,
      },
    })) as FullCusProduct[];

    return filterByOrgAndEnv({
      cusProducts: data,
      orgId,
      env,
    });
  }

  static async update({
    db,
    cusProductId,
    updates,
  }: {
    db: DrizzleCli;
    cusProductId: string;
    updates: Partial<CusProduct>;
  }) {
    return await db
      .update(customerProducts)
      .set(updates as any)
      .where(eq(customerProducts.id, cusProductId))
      .returning();
  }

  static async updateByStripeSubId({
    db,
    stripeSubId,
    updates,
  }: {
    db: DrizzleCli;
    stripeSubId: string;
    updates: Partial<CusProduct>;
  }) {
    let updated = await db
      .update(customerProducts)
      .set(updates as any)
      .where(
        or(
          eq(
            sql`${customerProducts.processor}->>'subscription_id'`,
            stripeSubId,
          ),
          arrayContains(customerProducts.subscription_ids, [stripeSubId]),
        ),
      )
      .returning({
        id: customerProducts.id,
      });

    let fullUpdated = (await db.query.customerProducts.findMany({
      where: inArray(
        customerProducts.id,
        updated.map((u) => u.id),
      ),
      with: {
        product: true,
        customer: true,
        ...getFullCusProdRelations(),
      },
    })) as FullCusProduct[];

    return fullUpdated as FullCusProduct[];
  }

  static async delete({
    db,
    cusProductId,
  }: {
    db: DrizzleCli;
    cusProductId: string;
  }) {
    return await db
      .delete(customerProducts)
      .where(eq(customerProducts.id, cusProductId))
      .returning();
  }

  static async getByFingerprint({
    db,
    freeTrialId,
    fingerprint,
  }: {
    db: DrizzleCli;
    freeTrialId: string;
    fingerprint: string;
  }) {
    let data = await db
      .select()
      .from(customerProducts)
      .innerJoin(
        customers,
        eq(customerProducts.internal_customer_id, customers.internal_id),
      )
      .where(
        and(
          eq(customers.fingerprint, fingerprint),
          eq(customerProducts.free_trial_id, freeTrialId),
        ),
      );

    return data;

    // const { data, error } = await sb
    //   .from("customer_products")
    //   .select("*, customer:customers!inner(*)")
    //   .eq("free_trial_id", freeTrialId)
    //   .eq("customer.fingerprint", fingerprint);
  }

  static async getByTrialAndCustomer({
    db,
    freeTrialId,
    internalCustomerId,
  }: {
    db: DrizzleCli;
    freeTrialId: string;
    internalCustomerId: string;
  }) {
    let data = await db.query.customerProducts.findMany({
      where: and(
        eq(customerProducts.free_trial_id, freeTrialId),
        eq(customerProducts.internal_customer_id, internalCustomerId),
      ),
      with: {
        customer: true,
      },
    });

    return data;
  }
}
