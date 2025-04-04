import RecaseError from "@/utils/errorUtils.js";
import {
  CustomerEntitlement,
  ErrCode,
  FullCustomerEntitlement,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";

export class CustomerEntitlementService {
  static async getCustomerAndEnts({
    sb,
    customerId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    customerId: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("customers")
      .select(
        `*, 
        customer_products:customer_products!inner(*), 
        customer_entitlements:customer_entitlements(*, entitlement:entitlements(*, feature:features(*)))`
      )
      .eq("id", customerId)
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("customer_products.status", "active")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new RecaseError({
        message: "Failed to getCustomerAndEnts (Supabase)",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    return data;
  }

  static async getCusEntsOptimized({
    sb,
    customerId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    customerId: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        `*, 
          entitlement:entitlements!inner(*),
          customer:customers!inner(*),
          customer_product:customer_products!inner(*)
        `
      )
      .eq("customer.id", customerId)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env)
      .eq("customer_product.status", "active");

    if (error) {
      throw error;
    }

    return data;
  }

  static async createMany({
    sb,
    customerEntitlements,
  }: {
    sb: SupabaseClient;
    customerEntitlements: CustomerEntitlement[];
  }) {
    const { error } = await sb
      .from("customer_entitlements")
      .insert(customerEntitlements);

    if (error) {
      throw error;
    }
  }

  static async createCustomerEntitlement({
    sb,
    customerEntitlement,
  }: {
    sb: SupabaseClient;
    customerEntitlement: CustomerEntitlement;
  }) {
    const { error } = await sb
      .from("customer_entitlements")
      .insert(customerEntitlement);

    if (error) {
      throw error;
    }

    return customerEntitlement;
  }

  static async getEntitlementsForReset(sb: SupabaseClient) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select("*, entitlement:entitlements(*)")
      .lt("next_reset_at", Date.now());

    if (error) {
      throw error;
    }

    return data;
  }

  static async getActiveByInternalCustomerId({
    sb,
    internalCustomerId,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        `*, 
        entitlement:entitlements!inner(
          *, feature:features!inner(*)
        ), 
        customer_product:customer_products!inner(
          *, product:products!inner(*)
        )`
      )
      .eq("internal_customer_id", internalCustomerId)
      .eq("customer_product.status", "active");

    if (error) {
      throw error;
    }

    return data;
  }

  static async getCustomerEntitlements({
    sb,
    orgId,
    customerId,
  }: {
    sb: SupabaseClient;
    orgId: string;
    customerId: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select("*, entitlement:entitlements(*)")
      .eq("org_id", orgId)
      .eq("customer_id", customerId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getActiveByCustomerId({
    sb,
    customerId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    customerId: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        `*, 
          customer:customers!inner(*), 
          entitlement:entitlements!inner(
            *, feature:features!inner(*)
          ), 
          customer_product:customer_products!inner(
            *, product:products!inner(*)
          )
        `
      )
      .eq("customer.id", customerId)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env)
      .eq("customer_product.status", "active");

    if (error) {
      throw error;
    }

    return data;
  }

  static async getActiveByFeatureAndCusId({
    sb,
    cusId,
    featureId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    cusId: string;
    featureId: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        "*, customer_product:customer_products!inner(*), entitlement:entitlements!inner(*, feature:features(*)), customer:customers(*)"
      )
      .eq("customer_id", cusId)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env)
      .eq("entitlement.feature_id", featureId)
      .eq("customer_product.status", "active");

    if (error) {
      throw error;
    }

    return data;
  }

  static async getActiveByFeatureId({
    sb,
    internalCustomerId,
    internalFeatureId,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    internalFeatureId: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select("*, customer_product:customer_products!inner(*)")
      .eq("internal_customer_id", internalCustomerId)
      .eq("internal_feature_id", internalFeatureId)
      .eq("customer_product.status", "active");

    if (error) {
      throw error;
    }

    return data;
  }

  static async getActiveInFeatureIds({
    sb,
    internalCustomerId,
    internalFeatureIds,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    internalFeatureIds: string[];
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        "*, customer_product:customer_products!inner(*), entitlement:entitlements(*, feature:features(*))"
      )
      .eq("internal_customer_id", internalCustomerId)
      .in("internal_feature_id", internalFeatureIds)
      .eq("customer_product.status", "active");

    if (error) {
      throw new RecaseError({
        message: "Error getting customer entitlements",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    return data;
  }

  static async getActiveResetPassed({
    sb,
    customDateUnix,
  }: {
    sb: SupabaseClient;
    customDateUnix?: number;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        "*, customer_product:customer_products!inner(*), entitlement:entitlements(*)"
      )
      .eq("customer_product.status", "active")
      .lt("next_reset_at", customDateUnix ? customDateUnix : Date.now());

    if (error) {
      throw error;
    }

    return data;
  }

  static async update({
    sb,
    id,
    updates,
  }: {
    sb: SupabaseClient;
    id: string;
    updates: Partial<CustomerEntitlement>;
  }) {
    const { error } = await sb
      .from("customer_entitlements")
      .update(updates)
      .eq("id", id);

    if (error) {
      throw error;
    }
  }

  static async getByIdStrict({
    sb,
    id,
    orgId,
    env,
    withCusProduct = false,
  }: {
    sb: SupabaseClient;
    id: string;
    orgId: string;
    env: string;
    withCusProduct?: boolean;
  }) {
    let selectQuery = `*, entitlement:entitlements!inner(*, feature:features!inner(*)), customer:customers!inner(*)${
      withCusProduct ? ", customer_product:customer_products!inner(*)" : ""
    }`;

    const { data, error } = await sb
      .from("customer_entitlements")
      .select(selectQuery as "*") // hack to kill generic string error
      .eq("id", id)
      .eq("customer.org_id", orgId)
      .eq("customer.env", env)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new RecaseError({
          message: "Customer entitlement not found",
          code: ErrCode.CustomerEntitlementNotFound,
          statusCode: StatusCodes.NOT_FOUND,
        });
      }
      throw error;
    }

    return data as FullCustomerEntitlement;
  }

  static async getByCusProductId({
    sb,
    cusProductId,
  }: {
    sb: SupabaseClient;
    cusProductId: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select("*, entitlement:entitlements!inner(*)")
      .eq("customer_product_id", cusProductId);

    if (error) {
      throw error;
    }

    return data;
  }

  static async incrementBalance({
    pg,
    id,
    amount,
  }: {
    pg: Client;
    id: string;
    amount: number;
  }) {
    try {
      const result = await pg.query(
        `UPDATE customer_entitlements SET balance = balance + $1 WHERE id = $2`,
        [amount, id]
      );
    } catch (error) {
      throw new RecaseError({
        message: "Failed to increase balance for customer entitlement",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
  }
}
