import { AutumnMetadata } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class MetadataService {
  static async insert(sb: SupabaseClient, metadata: AutumnMetadata) {
    const { data, error } = await sb.from("metadata").insert(metadata);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getMetadata(sb: SupabaseClient, id: string) {
    const { data, error } = await sb
      .from("metadata")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async getById(sb: SupabaseClient, id: string) {
    const { data, error } = await sb
      .from("metadata")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }
}
