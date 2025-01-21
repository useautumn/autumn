import { createSupabaseClient } from "@/external/supabaseUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv } from "@autumn/shared";

export const getFeaturesByOrg = async ({
  org_id,
  env,
}: {
  org_id: string;
  env: AppEnv;
}) => {
  let supabaseCli = createSupabaseClient();

  let { data, error } = await supabaseCli
    .from("features")
    .select("*")
    .eq("org_id", org_id)
    .eq("env", env);

  if (error) {
    throw new RecaseError({
      message: "Failed to fetch features from DB: " + error.message,
      code: "fetch_features_failed",
    });
  }

  return data;
};
