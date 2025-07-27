import { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProduct,
  CusProductStatus,
  Customer,
  CustomerEntitlement,
  customerPrices,
  customers,
  entitlements,
  ErrCode,
  features,
  FullCusEntWithProduct,
  FullCustomerEntitlement,
  prices,
  Replaceable,
  ResetCusEnt,
  Rollover,
} from "@autumn/shared";
import { customerEntitlements } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { eq, lt, and, sql } from "drizzle-orm";
import { customerProducts } from "@autumn/shared";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";

export class CusEntService {
  static async upsert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: CustomerEntitlement[];
  }) {
    if (Array.isArray(data) && data.length == 0) return;

    const updateColumns = buildConflictUpdateColumns(customerEntitlements, [
      "id",
    ]);
    await db
      .insert(customerEntitlements)
      .values(data as any)
      .onConflictDoUpdate({
        target: customerEntitlements.id,
        set: updateColumns,
      });
  }

  static async getByFeature({
    db,
    internalFeatureId,
  }: {
    db: DrizzleCli;
    internalFeatureId: string;
  }) {
    const data = await db
      .select()
      .from(customerEntitlements)
      .where(eq(customerEntitlements.internal_feature_id, internalFeatureId))
      .limit(10);

    return data as FullCustomerEntitlement[];
  }

  static async insert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: CustomerEntitlement[];
  }) {
    if (Array.isArray(data) && data.length === 0) {
      return;
    }

    await db.insert(customerEntitlements).values(data as any); // DRIZZLE TYPE REFACTOR
  }

  static async getActiveResetPassed({
    db,
    customDateUnix,
    batchSize = 1000,
  }: {
    db: DrizzleCli;
    customDateUnix?: number;
    batchSize?: number;
  }) {
    const allResults: FullCusEntWithProduct[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const data = await db
        .select()
        .from(customerEntitlements)
        .innerJoin(
          customerProducts,
          eq(customerEntitlements.customer_product_id, customerProducts.id)
        )
        .innerJoin(
          entitlements,
          eq(customerEntitlements.entitlement_id, entitlements.id)
        )
        .innerJoin(
          features,
          eq(entitlements.internal_feature_id, features.internal_id)
        )
        .innerJoin(
          customers,
          eq(customerEntitlements.internal_customer_id, customers.internal_id)
        )
        .where(
          and(
            eq(customerProducts.status, CusProductStatus.Active),
            lt(customerEntitlements.next_reset_at, customDateUnix ?? Date.now())
          )
        )
        .limit(batchSize)
        .offset(offset);

      if (data.length === 0) {
        hasMore = false;
      } else {
        const mappedData = data.map((item) => ({
          ...item.customer_entitlements,
          entitlement: {
            ...item.entitlements,
            feature: item.features,
          },
          customer_product: item.customer_products,
          customer: item.customers,
          replaceables: [],
          rollovers: [],
        })) as ResetCusEnt[];

        allResults.push(...mappedData);
        offset += batchSize;
        hasMore = data.length === batchSize;
        console.log(`Fetched ${allResults.length} entitlements to reset`);
      }
    }

    return allResults as ResetCusEnt[];
  }

  static async update({
    db,
    id,
    updates,
  }: {
    db: DrizzleCli;
    id: string;
    updates: Partial<CustomerEntitlement>;
  }) {
    const data = await db
      .update(customerEntitlements)
      .set(updates as any)
      .where(eq(customerEntitlements.id, id))
      .returning();

    return data;
  }

  static async getStrict({
    db,
    id,
    orgId,
    env,
    withCusProduct,
  }: {
    db: DrizzleCli;
    id: string;
    orgId: string;
    env: AppEnv;
    withCusProduct?: boolean;
  }) {
    const data = await db.query.customerEntitlements.findFirst({
      where: eq(customerEntitlements.id, id),
      with: {
        entitlement: {
          with: {
            feature: true,
          },
        },
        replaceables: true,
        rollovers: true,
        customer_product: withCusProduct || undefined,
        customer: true,
      },
    });

    if (
      !data ||
      !data.customer ||
      data.customer.org_id !== orgId ||
      data.customer.env !== env
    ) {
      throw new RecaseError({
        message: "Customer entitlement not found",
        code: ErrCode.CustomerEntitlementNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    return data as FullCustomerEntitlement & {
      customer: Customer;
      customer_product?: CusProduct;
      // replaceables?: Replaceable[];
    };
  }

  static async increment({
    db,
    id,
    amount,
  }: {
    db: DrizzleCli;
    id: string;
    amount: number;
  }) {
    const data = await db
      .update(customerEntitlements)
      .set({ balance: sql`${customerEntitlements.balance} + ${amount}` })
      .where(eq(customerEntitlements.id, id))
      .returning();

    return data;
  }

  static async decrement({
    db,
    id,
    amount,
  }: {
    db: DrizzleCli;
    id: string;
    amount: number;
  }) {
    const data = await db
      .update(customerEntitlements)
      .set({ balance: sql`${customerEntitlements.balance} - ${amount}` })
      .where(eq(customerEntitlements.id, id))
      .returning();

    return data;
  }
}
