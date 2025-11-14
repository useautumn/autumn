import {
	type ApiEntityV1,
	ApiEntityV1Schema,
	type AppEnv,
	type EntityLegacyData,
	type FullCustomer,
	filterEntityLevelCusProducts,
	filterPlanAndFeatureExpand,
} from "@autumn/shared";
import { CACHE_CUSTOMER_VERSION } from "@lua/cacheConfig.js";
import { GET_ENTITY_SCRIPT } from "@lua/luaScripts.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { normalizeCachedData } from "@/utils/cacheUtils/normalizeCacheUtils.js";
import { setCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/setCachedApiCustomer.js";
import { getApiEntityBase } from "../apiEntityUtils/getApiEntityBase.js";

export const buildCachedApiEntityKey = ({
	entityId,
	customerId,
	orgId,
	env,
}: {
	entityId: string;
	customerId: string;
	orgId: string;
	env: string;
}) => {
	return `{${orgId}}:${env}:customer:${CACHE_CUSTOMER_VERSION}:${customerId}:entity:${entityId}`;
};

/**
 * Get ApiEntity from Redis cache
 * If not found, fetch from DB, cache it, and return
 * If skipCache is true, always fetch from DB
 */
export const getCachedApiEntity = async ({
	ctx,
	customerId,
	entityId,
	skipCustomerMerge = false,
	fullCus,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	skipCustomerMerge?: boolean; // If true, returns only entity's own features (no customer merging)
	fullCus?: FullCustomer;
}): Promise<{ apiEntity: ApiEntityV1; legacyData: EntityLegacyData }> => {
	const { org, env, db, skipCache } = ctx;

	const getExpandedApiEntity = async () => {
		// Try to get from cache using Lua script (unless skipCache is true)
		if (!skipCache) {
			const cachedResult = await tryRedisRead(() =>
				redis.eval(
					GET_ENTITY_SCRIPT,
					0, // No KEYS, all params in ARGV
					org.id, // ARGV[1]
					env, // ARGV[2]
					customerId, // ARGV[3]
					entityId, // ARGV[4]
					skipCustomerMerge ? "true" : "false", // ARGV[5]
				),
			);

			// If found in cache, parse and return
			if (cachedResult) {
				const cached = normalizeCachedData(
					JSON.parse(cachedResult as string) as ApiEntityV1 & {
						legacyData: EntityLegacyData;
					},
				);

				const { legacyData, ...rest } = cached;

				return {
					apiEntity: ApiEntityV1Schema.parse(rest),
					legacyData,
				};
			}
		}

		// Cache miss or skipCache - fetch from DB
		if (!fullCus) {
			fullCus = await CusService.getFull({
				db,
				idOrInternalId: customerId,
				orgId: org.id,
				env: env as AppEnv,
				inStatuses: RELEVANT_STATUSES,
				withEntities: true,
				withSubs: true,
				entityId,
			});
		}

		const entity = fullCus.entity;
		if (!entity) {
			throw new Error(`Entity ${entityId} not found`);
		}

		// Store in cache (only if not skipping cache)
		if (!skipCache) {
			// Set entity cache
			await setCachedApiCustomer({
				ctx,
				fullCus,
				customerId,
			});
		}

		// Build ApiEntity with full products for return
		const { apiEntity, legacyData } = await getApiEntityBase({
			ctx,
			entity,
			fullCus: fullCus,
			withAutumnId: !skipCache,
		});

		const { apiEntity: pureApiEntity } = await getApiEntityBase({
			ctx,
			entity,
			fullCus: {
				...fullCus,
				customer_products: filterEntityLevelCusProducts({
					cusProducts: fullCus.customer_products,
				}),
			},
			withAutumnId: true,
		});

		return {
			apiEntity: ApiEntityV1Schema.parse(
				skipCustomerMerge ? pureApiEntity : apiEntity,
			),
			legacyData,
		};
	};

	const { apiEntity, legacyData } = await getExpandedApiEntity();
	const filteredApiEntity = filterPlanAndFeatureExpand<ApiEntityV1>({
		expand: ctx.expand,
		target: apiEntity,
	});

	return {
		apiEntity: filteredApiEntity,
		legacyData,
	};
};
