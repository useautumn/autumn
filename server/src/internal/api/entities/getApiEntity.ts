import type { ApiEntity, Entity, EntityExpand, FullCustomer } from "@autumn/shared";
import {
	AffectedResource,
	ApiVersion,
	applyResponseVersionChanges,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSingleEntityResponse } from "./getEntityUtils.js";

/**
 * Get API entity response with version transformations applied
 */
export const getApiEntity = async ({
	ctx,
	entity,
	fullCus,
	expand,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	entity: Entity;
	fullCus: FullCustomer;
	expand?: EntityExpand[];
	withAutumnId?: boolean;
}): Promise<ApiEntity> => {
	const { entity: entityData, legacyData } = await getSingleEntityResponse({
		ctx,
		entityId: entity.id,
		fullCus,
		entity,
		withAutumnId,
	});

	// For v1.2/v1.4 clients, transform plans → products
	const isLegacyVersion =
		ctx.apiVersion && ctx.apiVersion.lte(ApiVersion.V1_Beta);

	if (isLegacyVersion) {
		console.log("Legacy data keys:", Object.keys(legacyData));
		console.log(
			"First plan legacy data:",
			legacyData[entityData.plans?.[0]?.plan_id],
		);

		// Use the built-in version change system
		const transformed = applyResponseVersionChanges({
			input: {
				...entityData,
				features: {}, // Exclude features to avoid transformation errors
			},
			legacyData: {
				cusProductLegacyData: legacyData,
				cusFeatureLegacyData: {},
			},
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Customer,
		});

		// Merge back original features
		return {
			...transformed,
			features: entityData.features,
		} as unknown as ApiEntity;
	}

	return entityData;
};
