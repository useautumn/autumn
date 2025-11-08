import {
	type ApiEntity,
	ApiEntitySchema,
	type AppEnv,
	type FullCustomer,
	filterEntityLevelCusProducts,
} from "@autumn/shared";
import { GET_ENTITY_SCRIPT } from "@lua/luaScripts.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	normalizeCachedData,
	tryRedisRead,
} from "@/utils/cacheUtils/cacheUtils.js";
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
	return `{${orgId}}:${env}:customer:${customerId}:entity:${entityId}`;
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
	skipCache = false,
	skipCustomerMerge = false,
	fullCus,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	skipCache?: boolean;
	skipCustomerMerge?: boolean; // If true, returns only entity's own features (no customer merging)
	fullCus?: FullCustomer;
}): Promise<{ apiEntity: ApiEntity }> => {
	const { org, env, db } = ctx;

	const cacheKey = buildCachedApiEntityKey({
		entityId,
		customerId,
		orgId: org.id,
		env,
	});

	// Try to get from cache using Lua script (unless skipCache is true)
	if (!skipCache) {
		const cachedResult = await tryRedisRead(() =>
			redis.eval(
				GET_ENTITY_SCRIPT,
				1, // number of keys
				cacheKey, // KEYS[1]
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
				JSON.parse(cachedResult as string) as ApiEntity,
			);

			return {
				apiEntity: ApiEntitySchema.parse(cached),
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
	const { apiEntity } = await getApiEntityBase({
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
		apiEntity: ApiEntitySchema.parse(
			skipCustomerMerge ? pureApiEntity : apiEntity,
		),
	};
};
