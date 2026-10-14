import type { Entity, ExistingUsages } from "@autumn/shared";

export const mergeEntitiesWithExistingUsages = ({
	entities,
	existingUsages,
}: {
	entities: Entity[];
	existingUsages: ExistingUsages;
}): ExistingUsages => {
	const internalFeatureIdToEntityCount = new Map<string, number>();
	for (const entity of entities) {
		internalFeatureIdToEntityCount.set(
			entity.internal_feature_id,
			(internalFeatureIdToEntityCount.get(entity.internal_feature_id) || 0) + 1,
		);
	}

	for (const [
		internalFeatureId,
		entityCount,
	] of internalFeatureIdToEntityCount.entries()) {
		if (!existingUsages[internalFeatureId]) {
			existingUsages[internalFeatureId] = {
				usage: entityCount,
				entityUsages: {},
			};
		} else {
			existingUsages[internalFeatureId].usage = entityCount;
		}
	}

	return existingUsages;
};
