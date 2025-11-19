import {
	AffectedResource,
	type ApiEntityV1,
	applyResponseVersionChanges,
	type EntityLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedApiEntity } from "../apiEntityCacheUtils/getCachedApiEntity.js";
import { getApiEntityExpand } from "./getApiEntityExpand.js";

/**
 * Get full ApiEntity with expand fields and caching
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
}): Promise<ApiEntityV1> => {
	// Get base entity (cacheable or direct from DB)
	const { apiEntity: baseEntity, legacyData: entityLegacyData } =
		await getCachedApiEntity({
			ctx,
			customerId,
			entityId,
			fullCus,
		});

	// Clean api entity
	const cleanedEntity = {
		...baseEntity,
		autumn_id: withAutumnId ? baseEntity.autumn_id : undefined,
	};

	// Get expand fields (not cacheable)

	const apiEntityExpand = await getApiEntityExpand({
		ctx,
		customerId,
		entityId,
		fullCus,
	});

	// Merge expand fields
	const apiEntity = {
		...cleanedEntity,
		...apiEntityExpand,
	};

	return applyResponseVersionChanges<ApiEntityV1, EntityLegacyData>({
		input: apiEntity,
		legacyData: entityLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Entity,
	});
};
