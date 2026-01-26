import {
	addCusProductToCusEnt,
	cusEntsToUsage,
	type ExistingUsages,
	type FullCusProduct,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCustomerEntitlement,
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

		if (cusEnts.some(isUnlimitedCustomerEntitlement)) continue;

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
			const entityAllowance = cusEnt.entitlement.allowance ?? 0;
			for (const [entityId, entityBalance] of Object.entries(cusEnt.entities)) {
				// Usage = startingBalance + adjustment - currentBalance
				const entityUsage = new Decimal(entityAllowance)
					.add(entityBalance.adjustment ?? 0)
					.sub(entityBalance.balance)
					.toNumber();
				currentExistingUsage.entityUsages![entityId] = entityUsage;
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

		existingUsages[internalFeatureId].usage = new Decimal(
			existingUsages[internalFeatureId].usage,
		)
			.add(usage)
			.toNumber();
	}

	return existingUsages;
};
