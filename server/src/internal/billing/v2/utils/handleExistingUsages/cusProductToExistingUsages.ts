import {
	addCusProductToCusEnt,
	cusEntsToUnlimitedUsage,
	cusEntsToUsage,
	cusEntToBalance,
	cusEntToStartingBalance,
	ErrCode,
	type ExistingUsages,
	type FullCusProduct,
	featureUtils,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isUnlimitedCusEnt,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

export const cusProductToExistingUsages = ({
	cusProduct,
	entityId,

	carryAllConsumableFeatures,
	consumableFeatureIdsToCarry = [],
	carryUnlimitedUsage = false,
}: {
	cusProduct?: FullCusProduct;
	entityId?: string;

	carryAllConsumableFeatures?: boolean;
	consumableFeatureIdsToCarry?: string[];
	carryUnlimitedUsage?: boolean;
}): ExistingUsages => {
	if (!cusProduct) return {};

	const cusEnts = cusProduct.customer_entitlements;

	const existingUsages: ExistingUsages = {};

	for (const cusEnt of cusEnts) {
		if (isBooleanCusEnt({ cusEnt })) continue;

		const isUnlimited = isUnlimitedCusEnt(cusEnt);
		if (isUnlimited && !carryUnlimitedUsage) continue;

		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		if (isOneOffPrepaidConsumableCustomerEntitlement(cusEntWithCusProduct))
			continue;

		const isAllocated = featureUtils.isAllocated(cusEnt.entitlement.feature);

		const carryConsumableFeature =
			carryAllConsumableFeatures ||
			consumableFeatureIdsToCarry.includes(cusEnt.entitlement.feature.id);

		const shouldCarry = isAllocated || carryConsumableFeature;

		if (!shouldCarry) continue;

		const internalFeatureId = cusEnt.entitlement.internal_feature_id;

		if (!existingUsages[internalFeatureId]) {
			existingUsages[internalFeatureId] = {
				usage: 0,
				accruedOverage: 0,
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
				if (currentAttribution) {
					throw new RecaseError({
						message: `carry_over_usages cannot merge multiple attribution positions for credit feature '${cusEnt.entitlement.feature.id}'.`,
						code: ErrCode.InvalidRequest,
						statusCode: 400,
						data: {
							featureId: cusEnt.entitlement.feature.id,
							sourceInternalFeatureId,
						},
					});
				}
				mergedUsageAttribution[sourceInternalFeatureId] = {
					units: attribution.units,
					credits: attribution.credits,
				};
			}
			currentExistingUsage.usageAttribution = mergedUsageAttribution;
		}

		if (isEntityScopedCusEnt(cusEnt)) {
			const startingBalance = cusEntToStartingBalance({
				cusEnt: cusEntWithCusProduct,
			});
			for (const [entityId, entityBalance] of Object.entries(cusEnt.entities)) {
				const entityUsage = new Decimal(startingBalance)
					.add(entityBalance.adjustment ?? 0)
					.sub(entityBalance.balance)
					.toNumber();
				currentExistingUsage.entityUsages![entityId] = new Decimal(
					currentExistingUsage.entityUsages![entityId] ?? 0,
				)
					.add(entityUsage)
					.toNumber();
			}
			continue;
		}

		if (isUnlimited) {
			existingUsages[internalFeatureId].usage = new Decimal(
				existingUsages[internalFeatureId].usage,
			)
				.add(
					cusEntsToUnlimitedUsage({
						cusEnts: [cusEntWithCusProduct],
						entityId,
					}),
				)
				.toNumber();
			continue;
		}

		const usage = cusEntsToUsage({
			cusEnts: [cusEntWithCusProduct],
			entityId,
		});

		existingUsages[internalFeatureId].usage = new Decimal(
			existingUsages[internalFeatureId].usage,
		)
			.add(usage)
			.toNumber();

		const rowBalance = cusEntToBalance({
			cusEnt: cusEntWithCusProduct,
			entityId,
		});

		if (rowBalance < 0) {
			currentExistingUsage.accruedOverage = new Decimal(
				currentExistingUsage.accruedOverage ?? 0,
			)
				.sub(rowBalance)
				.toNumber();
		}
	}

	return existingUsages;
};
