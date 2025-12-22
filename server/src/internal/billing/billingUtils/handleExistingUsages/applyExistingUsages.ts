import {
	cusProductsToCusEnts,
	type Entity,
	type ExistingUsages,
	type FullCusProduct,
} from "@autumn/shared";
import { deductFromCusEntsTypescript } from "../../../balances/track/deductUtils/deductFromCusEntsTypescript";
import { mergeEntitiesWithExistingUsages } from "./mergeEntitiesWithExistingUsages";

export const applyExistingUsages = ({
	customerProduct,
	existingUsages = {},
	entities,
}: {
	customerProduct: FullCusProduct;
	existingUsages?: ExistingUsages;
	entities: Entity[];
}) => {
	// 1. Merge entities with existing usages
	const mergedExistingUsages = mergeEntitiesWithExistingUsages({
		entities,
		existingUsages,
	});

	for (const [internalFeatureId, existingUsage] of Object.entries(
		mergedExistingUsages,
	)) {
		const cusEnts = cusProductsToCusEnts({
			cusProducts: [customerProduct],
			internalFeatureId,
		});

		// 1. Deduct entity usages
		for (const [entityId, entityUsage] of Object.entries(
			existingUsage.entityUsages,
		)) {
			deductFromCusEntsTypescript({
				cusEnts,
				amountToDeduct: entityUsage,
				targetEntityId: entityId,
			});
		}

		// 2. Deduct top level usages
		deductFromCusEntsTypescript({
			cusEnts,
			amountToDeduct: existingUsage.usage,
		});

		for (const newCusEnt of cusEnts) {
			const original = customerProduct.customer_entitlements.find(
				(ce) => ce.id === newCusEnt.id,
			);
			if (original) {
				original.balance = newCusEnt.balance;
				original.entities = newCusEnt.entities;
				original.adjustment = newCusEnt.adjustment;
			}
		}
	}
};
