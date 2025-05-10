import { SupabaseClient } from "@supabase/supabase-js";
import {
  AppEnv,
  CusExpand,
  CusProductStatus,
  Customer,
  EntityExpand,
  FullCusProduct,
} from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { flipProductResults } from "../api/customers/cusUtils.js";
import { sbWithRetry } from "@/external/supabaseUtils.js";

const printCusProducts = (cusProducts: FullCusProduct[]) => {
  for (let cusProduct of cusProducts) {
    console.log(`Product: ${cusProduct.product.name}`);
    for (let cusEnt of cusProduct.customer_entitlements) {
      console.log(
        `Entitlement: ${cusEnt.entitlement.feature_id}, Balance: ${cusEnt.balance}`
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
          self.findIndex((t: any) => t.product_id === trial.product_id)
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

  static async getById({
    sb,
    id,
    orgId,
    env,
    logger,
  }: {
    sb: SupabaseClient;
    id: string;
    orgId: string;
    env: AppEnv;
    logger: any;
  }) {
    const { data, error } = await sbWithRetry({
      query: async () =>
        sb
          .from("customers")
          .select()
          .eq("id", id)
          .eq("org_id", orgId)
          .eq("env", env),
      retries: 3,
      logger,
    });

    if (error) {
      throw new RecaseError({
        code: ErrCode.InternalError,
        message: "Failed to get customer by ID",
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    if (data.length === 0) {
      return null;
    }

    return data[0];
  }

  static async getByEmail({
    sb,
    email,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    email: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select()
      .eq("email", email)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw new RecaseError({
        code: ErrCode.InternalError,
        message: "Failed to get customer by email",
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    return data;
  }

  static async getByIdOrEmail({
    sb,
    idOrEmail,
    orgId,
    env,
    isFull = false,
  }: {
    sb: SupabaseClient;
    idOrEmail: string;
    orgId: string;
    env: AppEnv;
    isFull?: boolean;
  }) {
    let query = "*";
    if (isFull) {
      query = `*, 
      products:customer_products(
        *, product:products(*), 
        customer_prices:customer_prices(
          *, price:prices(*)
        ),
        customer_entitlements:customer_entitlements(
          *, entitlement:entitlements(*, feature:features(*))
        ),
        free_trial:free_trials(*)
      ), 
      
      entitlements:customer_entitlements(*, entitlement:entitlements(*, feature:features(*))), 
      prices:customer_prices(*, price:prices(*))`;
    }

    const { data, error } = await sb
      .from("customers")
      .select(query as "*")
      .or(`id.eq.${idOrEmail},email.eq.${idOrEmail}`)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    } else if (data.length > 1) {
      throw new RecaseError({
        code: ErrCode.DuplicateCustomerId,
        message: `Multiple customers found for ${idOrEmail}`,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    return data[0];
  }

  static async getByIdOrInternalId({
    sb,
    idOrInternalId,
    orgId,
    env,
    isFull = false,
  }: {
    sb: SupabaseClient;
    idOrInternalId: string;
    orgId: string;
    env: AppEnv;
    isFull?: boolean;
  }) {
    let query = "*";
    if (isFull) {
      query = `*, 
        products:customer_products(
          *, product:products(*), 
          customer_prices:customer_prices(
            *, price:prices(*)
          ),
          customer_entitlements:customer_entitlements(
            *, entitlement:entitlements(*, feature:features(*))
          ),
          free_trial:free_trials(*)
        ), 
        
        entitlements:customer_entitlements(*, entitlement:entitlements(*, feature:features(*))), 
        prices:customer_prices(*, price:prices(*))`;
    }

    const { data, error } = await sb
      .from("customers")
      .select(query as "*")
      .or(`id.eq.${idOrInternalId},internal_id.eq.${idOrInternalId}`)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    } else if (data.length > 1) {
      // 1. Return where id is equal to idOrInternalId
      const customer = data.find((c) => c.id === idOrInternalId);
      if (customer) {
        return customer;
      } else {
        return data[0];
      }
    }

    return data[0];
  }

  static async getByInternalId({
    sb,
    internalId,
  }: {
    sb: SupabaseClient;
    internalId: string;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select()
      .eq("internal_id", internalId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getFullCustomer({
    sb,
    env,
    orgId,
    customerId,
    internalCustomerId,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
    customerId?: string;
    internalCustomerId?: string;
  }) {
    let query = sb
      .from("customers")
      .select(
        `*, 
      products:customer_products(
        *, product:products(*), 
        customer_prices:customer_prices(
          *, price:prices(*)
        ),
        customer_entitlements:customer_entitlements(
          *, entitlement:entitlements(*, feature:features(*))
        ),
        free_trial:free_trials(*)
      ), 
      
      entitlements:customer_entitlements(*, entitlement:entitlements(*, feature:features(*))), 
      prices:customer_prices(*, price:prices(*))`
      )
      .eq("env", env)
      .eq("org_id", orgId);

    if (customerId) {
      query.eq("id", customerId);
    } else if (internalCustomerId) {
      query.eq("internal_id", internalCustomerId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getByStripeId({
    sb,
    stripeId,
  }: {
    sb: SupabaseClient;
    stripeId: string;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select()
      .eq("processor->>id", stripeId);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    }

    return data[0];
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
        }
      );
    }

    if (lastItem) {
      query.or(
        `"created_at".lt.${lastItem.created_at},` +
          `and("created_at".eq.${lastItem.created_at},"internal_id".gt.${lastItem.internal_id})`,
        customerPrefix && {
          foreignTable: "customers",
          referencedTable: "customers",
        }
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
        }
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

  static async getCustomers(
    sb: SupabaseClient,
    orgId: string,
    env: AppEnv,
    page: number = 1,
    pageSize: number = 50
  ) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await sb
      .from("customers")
      .select("*", { count: "exact" })
      .eq("org_id", orgId)
      .eq("env", env)
      .order("created_at", { ascending: false })
      .order("name", { ascending: true })
      .order("internal_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    return { data, count };
  }

  static async createCustomer({
    sb,
    customer,
  }: {
    sb: SupabaseClient;
    customer: Customer;
  }) {
    const { data, error } = await sb
      .from("customers")
      .insert(customer)
      .select()
      .single();

    if (error) {
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

    return data;
  }

  static async update({
    sb,
    internalCusId,
    update,
  }: {
    sb: SupabaseClient;
    internalCusId: string;
    update: any;
  }) {
    const { data, error } = await sb
      .from("customers")
      .update(update)
      .eq("internal_id", internalCusId)
      .select()
      .single();

    if (error) {
      if (error.code == "2305") {
        throw new RecaseError({
          message: `Customer ${internalCusId} already exists`,
          code: ErrCode.DuplicateCustomerId,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
      throw new RecaseError({
        message: `Error updating customer...please try again later.`,
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    return data;
  }

  static async deleteCustomerStrict({
    sb,
    customerId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    customerId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { error } = await sb
      .from("customers")
      .delete()
      .eq("id", customerId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }
  }

  static async deleteByInternalId({
    sb,
    internalId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { error } = await sb
      .from("customers")
      .delete()
      .eq("internal_id", internalId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }
  }

  // ENTITLEMENTS

  // Get active products
  static async getFullCusProducts({
    sb,
    internalCustomerId,
    withPrices = false,
    withProduct = false,
    inStatuses,
    productGroup,
    logger,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    withProduct?: boolean;
    withPrices?: boolean;
    inStatuses?: CusProductStatus[];
    productGroup?: string;
    logger?: any;
  }) {
    const selectQuery = [
      "*",
      withProduct ? "product:products!inner(*)" : "",
      withPrices
        ? "customer_prices:customer_prices(*, price:prices!inner(*))"
        : "",
      `customer_entitlements:customer_entitlements(*, 
          entitlement:entitlements(*, 
            feature:features!inner(*)
          )
      )`,
      `free_trial:free_trials(*)`,
    ]
      .filter(Boolean)
      .join(", ");

    const query = sb
      .from("customer_products")
      .select(selectQuery)
      .eq("internal_customer_id", internalCustomerId);

    if (inStatuses) {
      query.in("status", inStatuses);
    }

    if (productGroup) {
      query.eq("product.group", productGroup);
    }

    // query.limit(100);
    // TODO: Limit 100 cus products? (for one time add ons...)
    // SORT by created_at?

    const { data, error } = await sbWithRetry({
      query: async () => await query,
      logger,
    });

    if (error) {
      console.log("CusService.getFullCusProducts failed", error);
      throw error;
    }

    // for (const cusProduct of data) {
    //   // console.log("Free trial", cusProduct.free_trial);
    //   // let freeTrial = cusProduct.free_trial;
    //   // if (freeTrial && freeTrial.length > 0) {
    //   //   cusProduct.free_trial = freeTrial[0];
    //   // } else {
    //   //   cusProduct.free_trial = null;
    //   // }
    // }
    return data as any;
  }

  // Get in IDs
  static async getInIds({
    sb,
    cusIds,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    cusIds: string[];
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select("*")
      .in("id", cusIds)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    return data;
  }
}

// const query = sb
//   .from("customers")
//   .select(
//     `
//       *,
//       customer_products:customer_products(*
//         , customer_entitlements:customer_entitlements(*,
//           entitlement:entitlements!inner(*,
//             feature:features!inner(*)
//           )
//         )
//         ${
//           withPrices
//             ? ", customer_prices:customer_prices(*, price:prices!inner(*))"
//             : ""
//         }
//         ${withProduct ? ", product:products!inner(*)" : ""}
//       )
//     `
//   )
//   .eq("internal_id", internalCustomerId)
//   .order("customer_products.created_at", {
//     ascending: false,
//     referencedTable: "customer_products",
//   })
//   .limit(15, { referencedTable: "customer_products" });
