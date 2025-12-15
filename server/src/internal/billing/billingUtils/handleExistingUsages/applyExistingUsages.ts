import {
	cusProductsToCusEnts,
	type Entity,
	type ExistingUsages,
	type Feature,
	type FullCusProduct,
	getRelevantFeatures,
} from "@autumn/shared";
import { mergeEntitiesWithExistingUsages } from "./mergeEntitiesWithExistingUsages";

export const applyExistingUsages = ({
	features,
	cusProduct,
	existingUsages,
	entities,
}: {
	features: Feature[];
	cusProduct: FullCusProduct;
	existingUsages: ExistingUsages;
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

		// 1. Get relevant features?

		const cusEnts = cusProductsToCusEnts({
			cusProducts: [cusProduct],
			internalFeatureId: internalFeatureId,
		});

		const relevatnFeatures = getRelevantFeatures({
			features,
			featureId: internalFeatureId,
		});

		// for (const cusEnt of cusEnts) {
		// 	// 1. If it's entity scoped
		// 	if (isEntityScopedCusEnt({ cusEnt })) {
		// 		continue;
		// 	}

		// 	// 2. If it's not entity scoped
		// 	const startingBalance = cusEntToStartingBalance({ cusEnt });
		// 	const newBalance = new Decimal(startingBalance)
		// 		.sub(existingUsage.usage)
		// 		.toNumber();

		// 	// Update the original cusEnt in the cusProduct (cusProductsToCusEnts returns copies)
		// 	const originalCusEnt = cusProduct.customer_entitlements.find(
		// 		(ce) => ce.id === cusEnt.id,
		// 	);
		// 	if (originalCusEnt) {
		// 		originalCusEnt.balance = newBalance;
		// 	}

		// 	console.log(
		// 		`Feature: ${originalCusEnt?.entitlement.feature.id}, Starting balance: ${startingBalance}, New balance: ${newBalance}`,
		// 	);
		// }
	}
};
