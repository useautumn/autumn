import { CacheType } from "@/external/caching/cacheActions.js";
import { getAPIKeyCache } from "@/external/caching/cacheUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";

export const verifyPublicKey = async ({
  sb,
  pkey,
  env,
}: {
  sb: SupabaseClient;
  pkey: string;
  env: AppEnv;
}) => {
  const start = performance.now();
  let data = await getAPIKeyCache({
    action: CacheType.PublicKey,
    key: pkey,
    fn: async () =>
      await OrgService.getFromPkeyWithFeatures({
        sb,
        pkey,
        env,
      }),
  });
  const end = performance.now();

  if (!data) {
    return null;
  }

  let org = structuredClone(data);
  try {
    console.log(
      `verify pkey took ${(end - start).toFixed(2)}ms, org: ${org.slug}`
    );
  } catch (error) {}

  delete org.features;
  return {
    org,
    features: data.features,
  };
};
