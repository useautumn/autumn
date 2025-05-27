import { DrizzleCli } from "@/db/initDrizzle.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { getAPIKeyCache } from "@/external/caching/cacheUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";

export const verifyPublicKey = async ({
  db,
  pkey,
  env,
}: {
  db: DrizzleCli;
  pkey: string;
  env: AppEnv;
}) => {
  let data = await getAPIKeyCache({
    action: CacheType.PublicKey,
    key: pkey,
    fn: async () =>
      await OrgService.getFromPkeyWithFeatures({
        db,
        pkey,
        env,
      }),
  });

  if (!data) {
    return null;
  }

  let org = structuredClone(data);

  delete org.features;
  return {
    org,
    features: data.features,
  };
};
