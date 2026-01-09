import {
	type ApiEntityV1,
	ApiEntityV1Schema,
	type AppEnv,
	CusExpand,
	type EntityLegacyData,
	EntityLegacyDataSchema,
	EntityNotFoundError,
	type FullCustomer,
	filterEntityLevelCusProducts,
	filterPlanAndFeatureExpand,
} from "@autumn/shared";
import { CACHE_CUSTOMER_VERSION } from "@lua/cacheConfig.js";
import type { Redis } from "ioredis";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { normalizeFromSchema } from "@/utils/cacheUtils/normalizeFromSchema.js";
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
	redisInstance,
	cacheVersion,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	skipCustomerMerge?: boolean; // If true, returns only entity's own features (no customer merging)
	fullCus?: FullCustomer;
	redisInstance?: Redis; // Optional redis instance for cross-region sync
	cacheVersion?: string; // Optional cache version override (for sync)
}): Promise<{ apiEntity: ApiEntityV1; legacyData: EntityLegacyData }> => {
	const { org, env, db, skipCache } = ctx;
	const redisClient = redisInstance || redis;

	const getExpandedApiEntity = async () => {
		// Try to get from cache using Lua script (unless skipCache is true)
		if (!skipCache) {
			const cachedResult = await tryRedisRead(() =>
				(redisClient as typeof redis).getEntity(
					cacheVersion || "",
					org.id,
					env,
					customerId,
					entityId,
					skipCustomerMerge ? "true" : "false",
				),
			);

			// If found in cache, parse and return
			if (cachedResult) {
				const parsed = JSON.parse(cachedResult as string) as ApiEntityV1 & {
					legacyData: EntityLegacyData;
				};

				// Extract legacyData before normalization (not in schema)
				const { legacyData, ...rest } = parsed;

				// Normalize the data based on schema
				const normalized = normalizeFromSchema<ApiEntityV1>({
					schema: ApiEntityV1Schema,
					data: rest,
				});

				const normalizedLegacyData = normalizeFromSchema<EntityLegacyData>({
					schema: EntityLegacyDataSchema,
					data: legacyData,
				});

				return {
					apiEntity: ApiEntityV1Schema.parse(normalized),
					legacyData: normalizedLegacyData,
				};
			}
		}

		// Record timestamp before Postgres fetch for stale write prevention
		const fetchTimeMs = Date.now();
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
				// entityId,
				expand: [CusExpand.Invoices],
			});

			fullCus.entity = fullCus.entities.find((e) => e.id === entityId);
		}

		const entity = fullCus.entity;

		if (!entity) {
			// throw new Error(`Entity ${entityId} not found`);
			throw new EntityNotFoundError({ entityId });
		}

		// Store in cache (only if not skipping cache)
		if (!skipCache) {
			// Set entity cache
			await setCachedApiCustomer({
				ctx,
				fullCus,
				customerId,
				fetchTimeMs,
			});
		}

		// Build ApiEntity with full products for return
		const { apiEntity, legacyData } = await getApiEntityBase({
			ctx,
			entity,
			fullCus: fullCus,
			withAutumnId: true,
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
