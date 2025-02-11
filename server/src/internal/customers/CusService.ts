import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv, CusProductStatus, Customer } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { CusProductService } from "./products/CusProductService.js";
import { flipProductResults } from "../api/customers/cusUtils.js";
import { format } from "date-fns";

export class CusService {
  static async getById({
    sb,
    id,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    id: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select()
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("env", env);

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
      .eq("email", email);

    if (error) {
      throw new RecaseError({
        code: ErrCode.InternalError,
        message: "Failed to get customer by email",
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    if (data.length === 0) {
      return null;
    } else if (data.length > 2) {
      throw new RecaseError({
        code: ErrCode.InternalError,
        message: "Multiple customers found with the same email",
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    return data[0];
  }

  static async getByIdOrEmail({
    sb,
    id,
    email,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    id: string;
    email: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select()
      .or(`id.eq.${id},email.eq.${email}`)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
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
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
    customerId: string;
  }) {
    const { data, error } = await sb
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
      .eq("org_id", orgId)
      .eq("id", customerId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
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

    console.log("pageNumber", pageNumber);
    if (pageNumber) {
      const from = (pageNumber - 1) * pageSize;
      const to = from + pageSize - 1;
      query.range(from, to);
    } else if (lastItem) {
      console.log("Using last item");
      query.or(
        `"created_at".lt.${lastItem.created_at},` +
          `and("created_at".eq.${lastItem.created_at},"internal_id".gt.${lastItem.internal_id})`,
        customerPrefix && {
          foreignTable: "customers",
          referencedTable: "customers",
        }
      );
    }

    query.order("created_at", {
      foreignTable: customerPrefix.slice(0, -1),
      ascending: false,
    });

    query.order("internal_id", {
      foreignTable: customerPrefix.slice(0, -1),
      ascending: true,
    });
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
        "*, customer:customers!inner(*), product:products!inner(id, name)",
        {
          count: "exact",
        }
      )
      .eq("customer.org_id", orgId)
      .eq("customer.env", env);

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

    if (filters.status || filters.product_id) {
      select = `*, customer_products:customer_products!inner(*, product:products(*))`;
    }

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
    // if (filters?.status === "canceled") {
    //   console.log("Adding canceled filter");
    //   query
    //     .not("customer_products.canceled_at", "is", null)
    //     .gt("customer_products.canceled_at", Date.now());
    // } else if (filters?.status === "free_trial") {
    //   console.log("Adding free trial filter");
    //   query
    //     .eq("customer_products.status", CusProductStatus.Active)
    //     .gt("customer_products.trial_ends_at", Date.now());
    // }

    // if (filters?.product_id) {
    //   console.log("Filtering for product:", filters.product_id);
    //   query.eq("customer_products.product.id", filters.product_id);
    // }

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

  // ENTITLEMENTS

  // Get active products
  static async getFullCusProducts({
    sb,
    internalCustomerId,
    withPrices = false,
    withProduct = false,
    inStatuses,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    withProduct?: boolean;
    withPrices?: boolean;
    inStatuses?: CusProductStatus[];
  }) {
    const query = sb
      .from("customers")
      .select(
        `
          *, 
          customer_products:customer_products(*
            , customer_entitlements:customer_entitlements(*, 
              entitlement:entitlements!inner(*, 
                feature:features!inner(*)
              )
            )
            ${
              withPrices
                ? ", customer_prices:customer_prices(*, price:prices!inner(*))"
                : ""
            }
            ${withProduct ? ", product:products!inner(*)" : ""}
          )
        `
      )
      .eq("internal_id", internalCustomerId);

    if (inStatuses) {
      query.in("customer_products.status", inStatuses);
    }

    const { data, error } = await query.single();

    if (error) {
      throw error;
    }

    return data.customer_products;
  }
}
