import { AppEnv, CusExpand, EntityExpand, FullCustomer } from "@autumn/shared";
import { ACTIVE_STATUSES } from "../cusProducts/CusProductService.js";
import { db } from "@/db/initDrizzle.js";
import { CusService } from "../CusService.js";
import { buildBaseCusCacheKey } from "./cusCacheUtils.js";
import { initUpstash } from "./upstashUtils.js";

export const getCusWithCache = async ({
  idOrInternalId,
  orgId,
  env,
  entityId,
  expand = [],
  allowNotFound = true,
  skipCache = false,
  skipGet = false,
}: {
  idOrInternalId: string;
  orgId: string;
  env: AppEnv;
  entityId?: string;

  // Optional
  expand?: (CusExpand | EntityExpand)[];
  allowNotFound?: boolean;
  skipCache?: boolean;
  skipGet?: boolean;
}): Promise<FullCustomer> => {
  const statuses = ACTIVE_STATUSES;
  const withEntities = true;
  const withSubs = true;

  const upstash = await initUpstash();
  if (!upstash) skipCache = true;

  const baseKey = buildBaseCusCacheKey({
    idOrInternalId,
    orgId,
    env,
    entityId,
  });

  const cacheKey = `${baseKey}:${expand.join(",")}`;
  if (!skipCache && !skipGet) {
    try {
      const cached = await upstash!.get(cacheKey);
      if (cached) {
        console.log(`Cache hit: ${cacheKey}`);
        return cached as FullCustomer;
      } else {
        console.log(`Cache miss: ${cacheKey}`);
      }
    } catch (error) {
      console.error(error);
    }
  }

  const customer = await CusService.getFull({
    db,
    idOrInternalId,
    orgId,
    env,
    inStatuses: statuses,
    withEntities,
    withSubs,
    allowNotFound,
    expand,
    entityId,
  });

  if (entityId && !customer.entity) skipCache = true;

  if (!skipCache) {
    try {
      await upstash!.set(cacheKey, customer);
      await upstash!.expire(cacheKey, 1000); // Expire after 60 seconds
    } catch (error) {
      console.error(error);
    }
  }

  return customer;
};
