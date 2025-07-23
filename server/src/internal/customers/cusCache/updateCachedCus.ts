import { CusExpand, FullCusEntWithFullCusProduct } from "@autumn/shared";
import { AppEnv } from "autumn-js";
import { buildBaseCusCacheKey } from "./cusCacheUtils.js";
import { getCusWithCache } from "./getCusWithCache.js";
import { initUpstash } from "./upstashUtils.js";

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
  const upstash = await initUpstash();
  if (!upstash) return;

  const baseKey = buildBaseCusCacheKey({
    idOrInternalId: customerId,
    orgId,
    env,
  });

  const list = await upstash.keys(`${baseKey}:*`);

  for (const key of list) {
    const keyName = key;
    let params = keyName.split(":");
    let expand = params ? params[params.length - 1].split(",") : [];

    await getCusWithCache({
      idOrInternalId: customerId,
      orgId,
      env,
      expand: expand as CusExpand[],
      skipGet: true,
    });
    console.log(`updated cache key: ${keyName}`);
  }
};
