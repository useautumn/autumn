import {
	AffectedResource,
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
}): Promise<ApiEntityV2> => {
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

	// Get base entity (cacheable or direct from DB)
	const { apiEntity: baseEntity, legacyData: entityLegacyData } =
		await getApiEntityBase({
			ctx,
			entity: fullCustomer.entity,
			fullCus: fullCustomer,
			withAutumnId,
		});

	// Clean api entity
	const cleanedEntity = {
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
	const apiEntity = {
		...cleanedEntity,
		...apiEntityExpand,
	};

	return applyResponseVersionChanges<ApiEntityV2, EntityLegacyData>({
		input: apiEntity,
		legacyData: entityLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Entity,
		ctx,
	});
};
