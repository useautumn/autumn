import { SupabaseClient } from "@supabase/supabase-js";
import {
  AppEnv,
  CusExpand,
  CusProductStatus,
  Customer,
  customers,
  EntityExpand,
  FullCusProduct,
} from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { flipProductResults } from "../api/customers/cusUtils.js";
import { sbWithRetry } from "@/external/supabaseUtils.js";
import { and, eq, or, sql } from "drizzle-orm";
import { DrizzleCli } from "@/db/initDrizzle.js";

const printCusProducts = (cusProducts: FullCusProduct[]) => {
  for (let cusProduct of cusProducts) {
    console.log(`Product: ${cusProduct.product.name}`);
    for (let cusEnt of cusProduct.customer_entitlements) {
      console.log(
        `Entitlement: ${cusEnt.entitlement.feature_id}, Balance: ${cusEnt.balance}`,
      );
    }

    for (let cusPrice of cusProduct.customer_prices) {
      console.log(`cusPrice:`, cusPrice.id, cusPrice.price.id);
    }
  }
};

export class CusService {
  static async getWithProducts({
    sb,
    idOrInternalId,
    orgId,
    env,
    inStatuses = [
      CusProductStatus.Active,
      CusProductStatus.PastDue,
      CusProductStatus.Scheduled,
    ],
    withEntities = false,
    entityId,
    expand,
    withSubs = false,
  }: {
    sb: SupabaseClient;
    idOrInternalId: string;
    orgId: string;
    env: AppEnv;
    inStatuses?: CusProductStatus[];
    withEntities?: boolean;
    entityId?: string;
    expand?: (CusExpand | EntityExpand)[];
    withSubs?: boolean;
  }) {
    const { data, error } = await sb.rpc("get_cus_with_products", {
      p_cus_id: idOrInternalId,
      p_org_id: orgId,
      p_env: env,
      p_statuses: inStatuses,
      p_with_entities: withEntities,
      p_entity_id: entityId,
      p_with_trials_used: expand?.includes(CusExpand.TrialsUsed),
      p_with_subs: withSubs,
      p_with_invoices: expand?.includes(CusExpand.Invoices),
    });

    if (error) {
      throw error;
    }

    if (!data || !data.customer) {
      return null;
    }

    let { customer, products, entities, entity } = data;

    if (!products) {
      products = [];
    }

    for (let product of products) {
      if (!product.customer_prices) {
        product.customer_prices = [];
      }

      if (!product.customer_entitlements) {
        product.customer_entitlements = [];
      }
    }

    let trialsUsed = data.trials_used;
    if (trialsUsed) {
      trialsUsed = trialsUsed.filter(
        (trial: any, index: number, self: any) =>
          index ===
          self.findIndex((t: any) => t.product_id === trial.product_id),
      );
    }

    return {
      ...customer,
      customer_products: products,
      entities: entities,
      entity: entity,
      trials_used: trialsUsed,
      subscriptions: data.subscriptions,
      invoices: data.invoices,
    };
  }

  static async get({
    db,
    idOrInternalId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    idOrInternalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const customer = await db.query.customers.findFirst({
      where: and(
        or(
          eq(customers.id, idOrInternalId),
          eq(customers.internal_id, idOrInternalId),
        ),
        eq(customers.org_id, orgId),
        eq(customers.env, env),
      ),
    });

    if (!customer) {
      return null;
    }

    return customer as Customer;
  }

  static async getByEmail({
    db,
    email,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    email: string;
    orgId: string;
    env: AppEnv;
  }) {
    const customer = await db.query.customers.findMany({
      where: and(
        eq(customers.email, email),
        eq(customers.org_id, orgId),
        eq(customers.env, env),
      ),
    });

    return customer as Customer[];
  }

  static async getByInternalId({
    db,
    internalId,
    errorIfNotFound = true,
  }: {
    db: DrizzleCli;
    internalId: string;
    errorIfNotFound?: boolean;
  }) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.internal_id, internalId),
    });

    if (errorIfNotFound && !customer) {
      throw new RecaseError({
        message: `Customer ${internalId} not found`,
        statusCode: 404,
        code: ErrCode.CustomerNotFound,
      });
    } else if (!customer) {
      return null;
    }

    return customer as Customer;
  }

  static async getByStripeId({
    db,
    stripeId,
  }: {
    db: DrizzleCli;
    stripeId: string;
  }) {
    const customer = await db.query.customers.findFirst({
      where: eq(sql`processor->>'id'`, stripeId),
    });

    if (!customer) {
      return null;
    }

    return customer as Customer;
  }

  //search customers

  static addPaginationAndSearch = ({
    query,
    search,
    pageNumber,
    pageSize,
    lastItem,
    customerPrefix = "",
  }: {
    query: any;
    search: string;
    pageNumber: number | null;
    pageSize: number;
    lastItem: any;
    customerPrefix: string;
  }) => {
    if (search && search !== "") {
      query.or(
        `"name".ilike.%${search}%, ` +
          `"email".ilike.%${search}%, ` +
          `"id".ilike.%${search}%`,
        customerPrefix && {
          foreignTable: "customers",
          referencedTable: "customers",
        },
      );
    }

    if (lastItem) {
      query.or(
        `"created_at".lt.${lastItem.created_at},` +
          `and("created_at".eq.${lastItem.created_at},"internal_id".gt.${lastItem.internal_id})`,
        customerPrefix && {
          foreignTable: "customers",
          referencedTable: "customers",
        },
      );
    }

    // if (pageNumber) {
    //   const from = (pageNumber - 1) * pageSize;
    //   const to = from + pageSize - 1;
    //   query.range(from, to);
    // } else if (lastItem) {
    //   query.or(
    //     `"created_at".lt.${lastItem.created_at},` +
    //       `and("created_at".eq.${lastItem.created_at},"internal_id".gt.${lastItem.internal_id})`,
    //     customerPrefix && {
    //       foreignTable: "customers",
    //       referencedTable: "customers",
    //     }
    //   );
    // }

    if (customerPrefix) {
      query.order(`customer(created_at)`, { ascending: false });
    } else {
      query
        .order("created_at", { ascending: false })
        .order("internal_id", { ascending: true });
    }

    query.limit(pageSize);
  };

  static async searchCustomersByProduct({
    sb,
    pg,
    orgId,
    env,
    search,
    filters,
    pageSize,
    lastItem,
    pageNumber,
  }: {
    sb: SupabaseClient;
    pg: Client;
    orgId: string;
    env: AppEnv;
    search: string;
    filters: any;
    pageSize: number;
    lastItem: any;
    pageNumber: number;
  }) {
    const query = sb
      .from("customer_products")
      .select(
        `*, 
        customer:customers!inner(*), product:products!inner(id, name, version)`,
        {
          count: "exact",
        },
      )
      .eq("customer.org_id", orgId)
      .eq("customer.env", env)
      .in("status", [CusProductStatus.Active, CusProductStatus.PastDue]);

    if (filters.product_id) {
      query.eq("product.id", filters.product_id);
    }

    if (filters?.status === "canceled") {
      console.log("Adding canceled filter");
      query
        .eq("status", CusProductStatus.Active)
        .not("canceled_at", "is", null);
    } else if (filters?.status === "free_trial") {
      console.log("Adding free trial filter");
      query
        .eq("status", CusProductStatus.Active)
        .gt("trial_ends_at", Date.now());
    }

    this.addPaginationAndSearch({
      query,
      search,
      pageNumber,
      pageSize,
      lastItem,
      customerPrefix: "customers.",
    });

    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    // Flip

    const customers = flipProductResults(data);

    return { data: customers, count };
  }

  static async searchCustomers({
    sb,
    pg,
    orgId,
    env,
    search,
    pageSize = 50,
    filters,
    lastItem,
    pageNumber,
  }: {
    pg: Client;
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
    search: string;
    lastItem?: { created_at: string; name: string; internal_id: string } | null;
    filters: any;
    pageSize?: number;
    pageNumber: number;
  }) {
    if (filters.product_id || filters.status) {
      return await this.searchCustomersByProduct({
        sb,
        pg,
        orgId,
        env,
        search,
        filters,
        pageSize,
        lastItem,
        pageNumber,
      });
    }

    let select =
      "*, customer_products:customer_products(*, product:products(*))";

    let query = sb
      .from("customers")
      .select(select, {
        count: "exact",
        // count: "planned", // use for 1M rows...?
      })
      .eq("org_id", orgId)
      .eq("env", env);

    this.addPaginationAndSearch({
      query,
      search,
      pageNumber: null,
      pageSize,
      lastItem,
      customerPrefix: "",
    });

    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    const totalCount = count && count + pageSize * (pageNumber - 1);
    return { data, count: totalCount };
  }

  static async insert({ db, data }: { db: DrizzleCli; data: Customer }) {
    try {
      const results = await db
        .insert(customers)
        .values(data as any)
        .returning();
      if (results && results.length > 0) {
        return results[0] as Customer;
      } else {
        return null;
      }
    } catch (error: any) {
      if (error.code === "23505") {
        throw new RecaseError({
          code: ErrCode.DuplicateCustomerId,
          message: "Customer ID already exists",
          statusCode: StatusCodes.BAD_REQUEST,
          data: error,
        });
      }
      throw error;
    }
    // const { data, error } = await sb
    //   .from("customers")
    //   .insert(customer)
    //   .select()
    //   .single();

    // if (error) {
    //   if (error.code === "23505") {
    //     throw new RecaseError({
    //       code: ErrCode.DuplicateCustomerId,
    //       message: "Customer ID already exists",
    //       statusCode: StatusCodes.BAD_REQUEST,
    //       data: error,
    //     });
    //   }
    //   throw error;
    // }

    // return data;
  }

  static async update({
    db,
    internalCusId,
    update,
  }: {
    db: DrizzleCli;
    internalCusId: string;
    update: any;
  }) {
    try {
      const results = await db
        .update(customers)
        .set(update)
        .where(eq(customers.internal_id, internalCusId))
        .returning();

      if (results && results.length > 0) {
        return results[0] as Customer;
      } else {
        return null;
      }
    } catch (error) {
      throw error;
    }
  }

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
    const results = await db
      .delete(customers)
      .where(
        and(
          eq(customers.internal_id, internalId),
          eq(customers.org_id, orgId),
          eq(customers.env, env),
        ),
      )
      .returning();

    return results;
  }
}

// static async getCustomers(
//   sb: SupabaseClient,
//   orgId: string,
//   env: AppEnv,
//   page: number = 1,
//   pageSize: number = 50,
// ) {
//   const from = (page - 1) * pageSize;
//   const to = from + pageSize - 1;

//   const { data, count, error } = await sb
//     .from("customers")
//     .select("*", { count: "exact" })
//     .eq("org_id", orgId)
//     .eq("env", env)
//     .order("created_at", { ascending: false })
//     .order("name", { ascending: true })
//     .order("internal_id", { ascending: true })
//     .range(from, to);

//   if (error) {
//     throw error;
//   }

//   return { data, count };
// }
