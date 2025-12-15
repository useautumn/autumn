import {
	cusProductsToCusEnts,
	type Entity,
	type ExistingUsages,
	type FullCusProduct,
} from "@autumn/shared";
import { deductFromCusEntsTypescript } from "../../../balances/track/deductUtils/deductFromCusEntsTypescript";
import { mergeEntitiesWithExistingUsages } from "./mergeEntitiesWithExistingUsages";

export const applyExistingUsages = ({
	cusProduct,
	existingUsages = {},
	entities,
}: {
	cusProduct: FullCusProduct;
	existingUsages?: ExistingUsages;
	entities: Entity[];
}) => {
	console.log(
		`applying existing usages to new cus product: ${cusProduct.product.name}`,
	);

	// 1. Merge entities with existing usages
	const mergedExistingUsages = mergeEntitiesWithExistingUsages({
		entities,
		existingUsages,
	});

	for (const [internalFeatureId, existingUsage] of Object.entries(
		mergedExistingUsages,
	)) {
		console.log(
			`Applying existing usage for feature: ${internalFeatureId}, usage: `,
			existingUsage,
		);

		const cusEnts = cusProductsToCusEnts({
			cusProducts: [cusProduct],
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
			const original = cusProduct.customer_entitlements.find(
				(ce) => ce.id === newCusEnt.id,
			);
			if (original) {
				original.balance = newCusEnt.balance;
				original.entities = newCusEnt.entities;
				original.adjustment = newCusEnt.adjustment;
			}
		}

		// console.log(
		// 	"New cus ents:",
		// 	JSON.stringify(
		// 		cusProduct.customer_entitlements.map((ce) => ({
		// 			feature_id: ce.feature_id,
		// 			balance: ce.balance,
		// 			entities: ce.entities,
		// 			adjustment: ce.adjustment,
		// 		})),
		// 		null,
		// 		2,
		// 	),
		// );
	}
};
