import { FreeTrial } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class FreeTrialService {
  static async getByInternalProductId(
    sb: SupabaseClient,
    internalProductId: string
  ) {
    const { data, error } = await sb
      .from("free_trials")
      .select("*")
      .eq("internal_product_id", internalProductId)
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async upsertByInternalProductId(
    sb: SupabaseClient,
    freeTrial: FreeTrial
  ) {
    let internalProductId = freeTrial.internal_product_id;

    // 1. Check if there is a free trial with the same product_id
    const existingFreeTrial = await this.getByInternalProductId(
      sb,
      internalProductId
    );

    if (existingFreeTrial) {
      await this.updateByInternalProductId(sb, internalProductId, {
        ...freeTrial,
      });
    } else {
      await sb.from("free_trials").insert(freeTrial);
    }
  }

  static async updateByInternalProductId(
    sb: SupabaseClient,
    internalProductId: string,
    update: Partial<FreeTrial>
  ) {
    const { error } = await sb
      .from("free_trials")
      .update(update)
      .eq("internal_product_id", internalProductId);

    if (error) {
      throw error;
    }
  }

  static async insert({ sb, data }: { sb: SupabaseClient; data: FreeTrial }) {
    const { error } = await sb.from("free_trials").insert(data);
    if (error) {
      throw error;
    }
  }

  static async update({
    sb,
    freeTrialId,
    update,
  }: {
    sb: SupabaseClient;
    freeTrialId: string;
    update: Partial<FreeTrial>;
  }) {
    const { error } = await sb
      .from("free_trials")
      .update(update)
      .eq("id", freeTrialId);

    if (error) {
      throw error;
    }
  }
}
