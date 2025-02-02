import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv, Customer } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";

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

  static async getCustomer({
    sb,
    env,
    orgId,
    customerId,
  }: {
    sb: SupabaseClient;
    env: AppEnv;
    orgId: string;
    customerId: string;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select()
      .eq("id", customerId)
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
  static async searchCustomers({
    sb,
    orgId,
    env,
    search,
    page,
    pageSize = 50,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
    search: string;
    page: number;
    pageSize?: number;
  }) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await sb
      .from("customers")
      .select("*, products:customer_products(*, product:products(*))", {
        count: "exact",
      })
      .eq("org_id", orgId)
      .eq("env", env)
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return { data, count };
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
}
