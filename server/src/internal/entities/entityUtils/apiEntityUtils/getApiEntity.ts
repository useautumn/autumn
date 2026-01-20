import {
	AffectedResource,
	type ApiEntityV1,
	type ApiEntityV2,
	applyResponseVersionChanges,
	type EntityLegacyData,
	EntityNotFoundError,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullCustomer } from "../../../customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { getApiEntityBase } from "./getApiEntityBase.js";
import { getApiEntityExpand } from "./getApiEntityExpand.js";
import { transformEntityV1ToEntityV2 } from "./transformEntityV1ToEntityV2.js";

/**
 * Get full ApiEntity with expand fields and caching
 * 
 * Returns V2 format (V2.1), which is then transformed down to V1/V0 by the version system
 */
export const getApiEntity = async ({
	ctx,
	customerId,
	entityId,
	fullCus,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	fullCus?: FullCustomer;
	withAutumnId?: boolean;
}): Promise<ApiEntityV1 | ApiEntityV2> => {
	const fullCustomer =
		fullCus ??
		(await getOrSetCachedFullCustomer({
			ctx,
			customerId,
			entityId,
			source: "getApiEntity",
		}));

	if (!fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId });
	}

	// Get base entity V1 (cacheable or direct from DB)
	const { apiEntity: baseEntity, legacyData: entityLegacyData } =
		await getApiEntityBase({
			ctx,
			entity: fullCustomer.entity,
			fullCus: fullCustomer,
			withAutumnId,
		});

	// Clean api entity
	const cleanedEntity: ApiEntityV1 = {
		...baseEntity,
		feature_id: baseEntity.feature_id || undefined,
		autumn_id: withAutumnId ? baseEntity.autumn_id : undefined,
	};

	const apiEntityExpand = await getApiEntityExpand({
		ctx,
		customerId,
		entityId,
		fullCus,
	});

	// Merge expand fields
	const apiEntityV1: ApiEntityV1 = {
		...cleanedEntity,
		...apiEntityExpand,
	};

	// Transform V1 → V2 (merge subscriptions, balances already in V1)
	const apiEntityV2 = transformEntityV1ToEntityV2({
		entity: apiEntityV1,
		legacyData: entityLegacyData,
	});

	// Apply version transformations based on API version (V2 → V1 for V2.0 clients, etc.)
	return applyResponseVersionChanges<ApiEntityV2, EntityLegacyData>({
		input: apiEntityV2,
		legacyData: entityLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Entity,
		ctx,
	});
};
