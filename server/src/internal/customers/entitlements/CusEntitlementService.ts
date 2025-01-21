import { AppEnv, CustomerEntitlement } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

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
}
