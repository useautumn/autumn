import {
	addCusProductToCusEnt,
	cusEntsToUnlimitedUsage,
	cusEntsToUsage,
	cusEntToBalance,
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

		// 1. If it's entity scoped
		if (isEntityScopedCusEnt(cusEnt)) {
			const entityAllowance = cusEnt.entitlement.allowance ?? 0;
			for (const [entityId, entityBalance] of Object.entries(cusEnt.entities)) {
				// Usage = startingBalance + adjustment - currentBalance
				const entityUsage = new Decimal(entityAllowance)
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

		// Unlimited rows track usage as a raw negative balance that the granted
		// balance helpers zero out, so read it directly. Never owed, so no overage.
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

		// A negative balance is usage that already exceeded its allowance, so it
		// was billable before this transition regardless of what replaces it.
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
