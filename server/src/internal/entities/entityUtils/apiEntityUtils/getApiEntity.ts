import type { ApiEntity, EntityExpand, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedApiEntity } from "../apiEntityCacheUtils/getCachedApiEntity.js";
import { getApiEntityExpand } from "./getApiEntityExpand.js";

/**
 * Get full ApiEntity with expand fields and caching
 */
export const getApiEntity = async ({
	ctx,
	expand,
	customerId,
	entityId,
	fullCus,
	withAutumnId = false,
	skipCache = false,
}: {
	ctx: AutumnContext;
	expand: EntityExpand[];
	customerId: string;
	entityId: string;
	fullCus?: FullCustomer;
	withAutumnId?: boolean;
	skipCache?: boolean;
}): Promise<ApiEntity> => {
	// Get base entity (cacheable or direct from DB)
	let { apiEntity: baseEntity } = await getCachedApiEntity({
		ctx,
		customerId,
		entityId,
		skipCache,
		fullCus,
	});

	// Clean api entity
	baseEntity = {
		...baseEntity,
		autumn_id: withAutumnId ? baseEntity.autumn_id : undefined,
	};

	// Get expand fields (not cacheable)
	const apiEntityExpand = await getApiEntityExpand({
		ctx,
		customerId,
		entityId,
		expand,
		fullCus,
	});

	// Merge expand fields
	const apiEntity = {
		...baseEntity,
		...apiEntityExpand,
	};

	// When entities have version changes, add this:
	// return applyResponseVersionChanges<EntityResponse, EntityLegacyData>({
	// 	input: apiEntity,
	// 	legacyData: entityLegacyData,
	// 	targetVersion: ctx.apiVersion,
	// 	resource: AffectedResource.Entity,
	// });

	return apiEntity;
};
