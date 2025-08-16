import {
  AppEnv,
  CusExpand,
  EntityExpand,
  FullCustomer,
  Organization,
} from "@autumn/shared";
import { RELEVANT_STATUSES } from "../cusProducts/CusProductService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "../CusService.js";
import { buildBaseCusCacheKey } from "./cusCacheUtils.js";
import { initUpstash } from "./upstashUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";

export const getCusWithCache = async ({
  db,
  idOrInternalId,
  org,
  env,
  entityId,
  expand = [],
  allowNotFound = true,
  skipCache = false,
  skipGet = false,
  logger,
}: {
  db: DrizzleCli;
  idOrInternalId: string;
  org: Organization;
  env: AppEnv;
  entityId?: string;

  // Optional
  expand?: (CusExpand | EntityExpand)[];
  allowNotFound?: boolean;
  skipCache?: boolean;
  skipGet?: boolean;
  logger: any;
}): Promise<FullCustomer> => {
  const statuses = RELEVANT_STATUSES;
  const withEntities = true;
  const withSubs = true;

  const upstash = await initUpstash();
  // || !org.config.cache_customer
  if (!upstash) skipCache = true;

  let cacheKey = buildBaseCusCacheKey({
    idOrInternalId,
    orgId: org.id,
    env,
    entityId,
  });

  if (expand.length > 0) {
    cacheKey = `${cacheKey}:expand_${expand.join(",")}`;
  }

  if (!skipCache && !skipGet) {
    try {
      const cached = await upstash!.get(cacheKey);
      if (cached) {
        return cached as FullCustomer;
      } else {
        // logger.info(`Cache miss: ${cacheKey}`);
      }
    } catch (error) {
      logger.error(`Failed to get cache: ${cacheKey}`, { error });
    }
  }

  const customer = await CusService.getFull({
    db,
    idOrInternalId,
    orgId: org.id,
    env,
    inStatuses: statuses,
    withEntities,
    withSubs,
    allowNotFound,
    expand,
    entityId,
  });

  if (entityId && nullish(customer?.entity)) skipCache = true;

  if (!skipCache && notNullish(customer)) {
    try {
      await upstash!.set(cacheKey, customer, {
        ex: 300,
      });
    } catch (error) {
      logger.error(`Failed to set cache: ${cacheKey}`, { error });
    }
  }

  return customer;
};
