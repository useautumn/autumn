import {
	addCusProductToCusEnt,
	cusEntsToUsage,
	type ExistingUsages,
	type FullCusProduct,
	featureUtils,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

export const cusProductToExistingUsages = ({
	cusProduct,
	entityId,

	carryAllConsumableFeatures,
	consumableFeatureIdsToCarry = [],
}: {
	cusProduct?: FullCusProduct;
	entityId?: string;

	carryAllConsumableFeatures?: boolean;
	consumableFeatureIdsToCarry?: string[];
}): ExistingUsages => {
	if (!cusProduct) return {};

	const cusEnts = cusProduct.customer_entitlements;

	const existingUsages: ExistingUsages = {};

	for (const cusEnt of cusEnts) {
		if (isBooleanCusEnt({ cusEnt })) continue;

		if (isUnlimitedCusEnt(cusEnt)) continue;

		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		if (isOneOffPrepaidConsumableCustomerEntitlement(cusEntWithCusProduct))
			continue;

		const isAllocated = featureUtils.isAllocated(cusEnt.entitlement.feature);

		// By default, don't carry any consumable feature, unless carryAll is true, OR consumableFeatureIdsToCarry includes the feature id
		const carryConsumableFeature =
			carryAllConsumableFeatures ||
			consumableFeatureIdsToCarry.includes(cusEnt.entitlement.feature.id);

		const shouldCarry = isAllocated || carryConsumableFeature;

		if (!shouldCarry) continue;

		const internalFeatureId = cusEnt.entitlement.internal_feature_id;

		if (!existingUsages[internalFeatureId]) {
			existingUsages[internalFeatureId] = {
				usage: 0,
				entityUsages: {},
			};
		}

		const currentExistingUsage = existingUsages[internalFeatureId];

		if (
			carryConsumableFeature &&
			Object.keys(cusEnt.usage_attribution ?? {}).length > 0
		) {
			const mergedUsageAttribution =
				currentExistingUsage.usageAttribution ?? {};
			for (const [sourceInternalFeatureId, attribution] of Object.entries(
				cusEnt.usage_attribution ?? {},
			)) {
				const currentAttribution =
					mergedUsageAttribution[sourceInternalFeatureId];
				mergedUsageAttribution[sourceInternalFeatureId] = {
					units: new Decimal(currentAttribution?.units ?? 0)
						.add(attribution.units)
						.toNumber(),
					credits: new Decimal(currentAttribution?.credits ?? 0)
						.add(attribution.credits)
						.toNumber(),
				};
			}
			currentExistingUsage.usageAttribution = mergedUsageAttribution;
		}

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
