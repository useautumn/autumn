import { createClient } from "@supabase/supabase-js";

export const createSupabaseClient = () => {
  try {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    throw error;
  }
};
