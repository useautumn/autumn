import { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CusProduct,
  CusProductStatus,
  Customer,
  CustomerEntitlement,
  entitlements,
  ErrCode,
  features,
  FullCusEntWithProduct,
  FullCustomerEntitlement,
} from "@autumn/shared";
import { customerEntitlements } from "@shared/models/cusProductModels/cusEntModels/cusEntTable.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { eq, lt, and, sql } from "drizzle-orm";
import { customerProducts } from "@shared/models/cusProductModels/cusProductTable.js";

export class CusEntService {
  static async getByFeature({
    // sb,
    db,
    internalFeatureId,
  }: {
    // sb: SupabaseClient;
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
    await db.insert(customerEntitlements).values(data as any); // DRIZZLE TYPE REFACTOR
  }

  static async getActiveResetPassed({
    db,
    customDateUnix,
  }: {
    db: DrizzleCli;
    customDateUnix?: number;
  }) {
    const data = await db
      .select()
      .from(customerEntitlements)
      .innerJoin(
        customerProducts,
        eq(customerEntitlements.customer_product_id, customerProducts.id),
      )
      .innerJoin(
        entitlements,
        eq(customerEntitlements.entitlement_id, entitlements.id),
      )
      .innerJoin(
        features,
        eq(entitlements.internal_feature_id, features.internal_id),
      )
      .where(
        and(
          eq(customerProducts.status, CusProductStatus.Active),
          lt(customerEntitlements.next_reset_at, customDateUnix ?? Date.now()),
        ),
      );

    return data.map((item) => ({
      ...item.customer_entitlements,
      entitlement: {
        ...item.entitlements,
        feature: item.features,
      },
      customer_product: item.customer_products,
    })) as FullCusEntWithProduct[];
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
}

// static async getActiveResetPassed({
//   sb,
//   customDateUnix,
// }: {
//   sb: SupabaseClient;
//   customDateUnix?: number;
// }) {
//   const { data, error } = await sb
//     .from("customer_entitlements")
//     .select(
//       "*, customer_product:customer_products!inner(*), entitlement:entitlements(*)",
//     )
//     .eq("customer_product.status", "active")
//     .lt("next_reset_at", customDateUnix ? customDateUnix : Date.now());

//   if (error) {
//     throw error;
//   }

//   return data;
// }

// static async update({
//   sb,
//   id,
//   updates,
// }: {
//   sb: SupabaseClient;
//   id: string;
//   updates: Partial<CustomerEntitlement>;
// }) {
//   const { data, error } = await sb
//     .from("customer_entitlements")
//     .update(updates)
//     .eq("id", id)
//     .select();

//   if (error) {
//     throw error;
//   }

//   return data;
// }

// static async getByIdStrict({
//   sb,
//   id,
//   orgId,
//   env,
//   withCusProduct = false,
// }: {
//   sb: SupabaseClient;
//   id: string;
//   orgId: string;
//   env: string;
//   withCusProduct?: boolean;
// }) {
//   let selectQuery = `*, entitlement:entitlements!inner(*, feature:features!inner(*)), customer:customers!inner(*)${
//     withCusProduct ? ", customer_product:customer_products!inner(*)" : ""
//   }`;

//   const { data, error } = await sb
//     .from("customer_entitlements")
//     .select(selectQuery as "*") // hack to kill generic string error
//     .eq("id", id)
//     .eq("customer.org_id", orgId)
//     .eq("customer.env", env)
//     .single();

//   if (error) {
//     if (error.code === "PGRST116") {
//       throw new RecaseError({
//         message: "Customer entitlement not found",
//         code: ErrCode.CustomerEntitlementNotFound,
//         statusCode: StatusCodes.NOT_FOUND,
//       });
//     }
//     throw error;
//   }

//   return data as FullCustomerEntitlement;
// }
