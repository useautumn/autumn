import {
  CusExpand,
  FullCusEntWithFullCusProduct,
  Organization,
} from "@autumn/shared";
import { AppEnv } from "autumn-js";
import { buildBaseCusCacheKey } from "./cusCacheUtils.js";
import { getCusWithCache } from "./getCusWithCache.js";
import { initUpstash } from "./upstashUtils.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const refreshCusCache = async ({
  db,
  customerId,
  entityId,
  // orgId,
  org,
  env,
}: {
  db: DrizzleCli;
  customerId: string;
  entityId?: string;
  // orgId: string;
  org: Organization;
  env: AppEnv;
}) => {
  try {
    const upstash = await initUpstash();
    if (!upstash) return;

    // if (!org.config.cache_customer) return;

    const baseKey = buildBaseCusCacheKey({
      idOrInternalId: customerId,
      orgId: org.id,
      env,
    });

    const list = await upstash.keys(`${baseKey}*`);

    const promises = [];
    for (const key of list) {
      const refresh = async () => {
        const keyName = key;
        let params = keyName.split(":");
        let expandParam = params.find((p) => p.startsWith("expand_"));
        let expand = expandParam
          ? expandParam.replace("expand_", "").split(",")
          : [];

        let entityIdParam = params.find((p) => p.startsWith("entity_"));
        let entityId = entityIdParam
          ? entityIdParam.replace("entity_", "")
          : undefined;

        await getCusWithCache({
          db,
          idOrInternalId: customerId,
          org,
          env,
          expand: expand as CusExpand[],
          entityId,
          skipGet: true,
          logger: console,
        });
      };
      promises.push(refresh());
    }
    await Promise.all(promises);
  } catch (error) {
    logger.error("Failed to update cache:", { error });
  }
};

export const deleteCusCache = async ({
  db,
  customerId,
  org,
  env,
}: {
  db: DrizzleCli;
  customerId: string;
  org: Organization;
  env: AppEnv;
}) => {
  try {
    const upstash = await initUpstash();
    if (!upstash) return;

    // if (!org.config.cache_customer) return;

    const baseKey = buildBaseCusCacheKey({
      idOrInternalId: customerId,
      orgId: org.id,
      env,
    });

    const list = await upstash.keys(`${baseKey}*`);

    for (const key of list) {
      await upstash.del(key);
    }
  } catch (error) {
    logger.error("Failed to delete cache:", { error });
  }
};
