import {
	type ApiEntityV1,
	ApiEntityV1Schema,
	type EntityLegacyData,
	EntityNotFoundError,
	type FullCustomer,
	filterEntityLevelCustomerEntitlementsFromFullCustomer,
	filterPlanAndFeatureExpand,
} from "@autumn/shared";

import { CACHE_CUSTOMER_VERSION } from "@lua/cacheConfig.js";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullCustomer } from "../../../customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
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
	redisInstance: _redisInstance,
	cacheVersion: _cacheVersion,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	skipCustomerMerge?: boolean; // If true, returns only entity's own features (no customer merging)
	fullCus?: FullCustomer;
	redisInstance?: Redis; // Kept for backwards compatibility
	cacheVersion?: string; // Kept for backwards compatibility
}): Promise<{ apiEntity: ApiEntityV1; legacyData: EntityLegacyData }> => {
	const getExpandedApiEntity = async () => {
		// Get FullCustomer from cache (reads from same cache that track Lua script updates)
		// Falls back to DB if cache miss
		if (!fullCus) {
			fullCus = await getOrSetCachedFullCustomer({
				ctx,
				customerId,
				entityId,
				source: "getCachedApiEntity",
			});

			fullCus.entity = fullCus.entities.find((e) => e.id === entityId);
		}

		const entity = fullCus.entity;

		if (!entity) {
			throw new EntityNotFoundError({ entityId });
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
			fullCus: filterEntityLevelCustomerEntitlementsFromFullCustomer({
				fullCustomer: fullCus,
			}),
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
