import RecaseError from "@/utils/errorUtils.js";
import { CustomerEntitlement, ErrCode } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";

export class CustomerEntitlementService {
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
    console.log("Getting entitlements for customer: ", customerId);
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

  static async getActiveResetPassed({ sb }: { sb: SupabaseClient }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select(
        "*, customer_product:customer_products!inner(*), entitlement:entitlements(*)"
      )
      .eq("customer_product.status", "active")
      .lt("next_reset_at", Date.now());

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
  }: {
    sb: SupabaseClient;
    id: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("customer_entitlements")
      .select("*, customer:customers!inner(*)")
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

    return data;
  }
}
