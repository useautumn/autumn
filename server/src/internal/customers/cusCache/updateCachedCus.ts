import { CusExpand, FullCusEntWithFullCusProduct } from "@autumn/shared";
import { AppEnv } from "autumn-js";
import { buildBaseCusCacheKey } from "./cusCacheUtils.js";
import { getCusWithCache } from "./getCusWithCache.js";
import { initUpstash } from "./upstashUtils.js";
import { logger } from "@/external/logtail/logtailUtils.js";

export const refreshCusCache = async ({
  customerId,
  entityId,
  orgId,
  env,
}: {
  customerId: string;
  entityId?: string;
  orgId: string;
  env: AppEnv;
}) => {
  try {
    const upstash = await initUpstash();
    if (!upstash) return;

    const baseKey = buildBaseCusCacheKey({
      idOrInternalId: customerId,
      orgId,
      env,
    });

    const list = await upstash.keys(`${baseKey}*`);

    for (const key of list) {
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
        idOrInternalId: customerId,
        orgId,
        env,
        expand: expand as CusExpand[],
        entityId,
        skipGet: true,
        logger: console,
      });
      // console.log(`updated cache key: ${keyName}`);
    }
  } catch (error) {
    logger.error("Failed to update cache:", { error });
  }
};

export const deleteCusCache = async ({
  customerId,
  orgId,
  env,
}: {
  customerId: string;
  orgId: string;
  env: AppEnv;
}) => {
  try {
    const upstash = await initUpstash();
    if (!upstash) return;

    const baseKey = buildBaseCusCacheKey({
      idOrInternalId: customerId,
      orgId,
      env,
    });

    const list = await upstash.keys(`${baseKey}*`);

    for (const key of list) {
      // console.log("Deleting cache for key:", key);
      await upstash.del(key);
    }
  } catch (error) {
    logger.error("Failed to delete cache:", { error });
  }
};
