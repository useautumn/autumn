import type { Entity, ExistingUsages } from "@autumn/shared";

export const mergeEntitiesWithExistingUsages = ({
	entities,
	existingUsages,
}: {
	entities: Entity[];
	existingUsages: ExistingUsages;
}): ExistingUsages => {
	// Count entities per feature (for continuous-use features like seats)
	const internalFeatureIdToEntityCount = new Map<string, number>();
	for (const entity of entities) {
		internalFeatureIdToEntityCount.set(
			entity.internal_feature_id,
			(internalFeatureIdToEntityCount.get(entity.internal_feature_id) || 0) + 1,
		);
	}

	// Add entity counts as top-level usage for features that track entities
	// Entity count takes priority over existing usage data
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
			// Entity count takes priority - override existing usage
			existingUsages[internalFeatureId].usage = entityCount;
		}
	}

	return existingUsages;
};
