import {
	addCusProductToCusEnt,
	cusEntsToUsage,
	type ExistingUsages,
	type FullCusProduct,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

export const cusProductToExistingUsages = ({
	cusProduct,
	entityId,
}: {
	cusProduct?: FullCusProduct;
	entityId?: string;
}): ExistingUsages => {
	if (!cusProduct) return {};

	const cusEnts = cusProduct.customer_entitlements;

	const existingUsages: Record<
		string,
		{
			usage: number;
			entityUsages: Record<string, number>;
		}
	> = {};

	for (const cusEnt of cusEnts) {
		if (isBooleanCusEnt({ cusEnt })) continue;

		if (cusEnts.some(isUnlimitedCusEnt)) continue;

		const internalFeatureId = cusEnt.entitlement.internal_feature_id;

		if (!existingUsages[internalFeatureId]) {
			existingUsages[internalFeatureId] = {
				usage: 0,
				entityUsages: {},
			};
		}

		const currentExistingUsage = existingUsages[internalFeatureId];

		// 1. If it's entity scoped
		if (isEntityScopedCusEnt(cusEnt)) {
			// const entityUsages = cusEnt.entities;
			for (const [entityId, entityBalance] of Object.entries(cusEnt.entities)) {
				currentExistingUsage.entityUsages![entityId] = entityBalance.balance;
			}
			continue;
		}

		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		// 2. If it's not entity scoped
		const usage = cusEntsToUsage({
			cusEnts: [cusEntWithCusProduct],
			entityId,
		});

		console.log(
			`Feature ${cusEntWithCusProduct.entitlement.feature.name} usage: ${usage}`,
		);

		existingUsages[internalFeatureId].usage = new Decimal(
			existingUsages[internalFeatureId].usage,
		)
			.add(usage)
			.toNumber();
	}

	return existingUsages;
};
