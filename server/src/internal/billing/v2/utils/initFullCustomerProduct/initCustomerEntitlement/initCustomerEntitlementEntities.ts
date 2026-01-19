import {
	type EntitlementWithFeature,
	type Entity,
	type EntityBalance,
	entitlementHasEntityFeature,
	isEntityScopedEntitlement,
} from "@autumn/shared";

export const initCustomerEntitlementEntities = ({
	entitlement,
	customerEntities,
	startingBalance,
}: {
	entitlement: EntitlementWithFeature;
	customerEntities: Entity[];
	startingBalance: number;
}): Record<string, EntityBalance> | null => {
	if (!isEntityScopedEntitlement({ entitlement })) return null;

	const entities: Record<string, EntityBalance> = {};

	for (const entity of customerEntities) {
		const featureMatches = entitlementHasEntityFeature({
			entitlement,
			entity,
		});

		if (!featureMatches) continue;

		entities[entity.id] = {
			id: entity.id,
			balance: startingBalance,
			adjustment: 0,
			additional_balance: 0,
		};
	}

	return entities;
};
