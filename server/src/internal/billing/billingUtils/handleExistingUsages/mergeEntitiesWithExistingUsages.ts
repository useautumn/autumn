import type { ExistingUsages } from "../../../../../../shared/models/billingModels/existingUsages";
import type { Entity } from "../../../../../../shared/models/cusModels/entityModels/entityModels";

export const mergeEntitiesWithExistingUsages = ({
	entities,
	existingUsages,
}: {
	entities: Entity[];
	existingUsages: ExistingUsages;
}): ExistingUsages => {
	const internalFeatureIdToUsage = new Map<string, number>();
	for (const entity of entities) {
		internalFeatureIdToUsage.set(
			entity.internal_feature_id,
			(internalFeatureIdToUsage.get(entity.internal_feature_id) || 0) + 1,
		);
	}

	for (const [internalFeatureId, usage] of internalFeatureIdToUsage.entries()) {
		existingUsages[internalFeatureId] = {
			usage,
			entityUsages: {},
		};
	}

	return existingUsages;
};
