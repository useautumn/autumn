import {
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import { getFeatureBalance } from "../../../customers/cusProducts/cusEnts/cusEntUtils.js";
import type { FeatureDeduction } from "./getFeatureDeductions.js";

/**
 * Calculate total available rollover balance for a feature
 */
const calculateAvailableRolloverBalance = ({
	cusEnts,
	feature,
	entityId,
}: {
	cusEnts: FullCustomerEntitlement[];
	feature: Feature;
	entityId?: string;
}) => {
	const featureCusEnts = cusEnts.filter(
		(cusEnt) => cusEnt.entitlement.internal_feature_id === feature.internal_id,
	);

	if (!entityId) {
		// Non-entity: sum rollover.balance
		return featureCusEnts.reduce((sum, cusEnt) => {
			const rolloverSum = cusEnt.rollovers.reduce(
				(rSum, rollover) =>
					new Decimal(rSum).add(rollover.balance || 0).toNumber(),
				0,
			);
			return new Decimal(sum).add(rolloverSum).toNumber();
		}, 0);
	} else {
		// Entity: sum rollover.entities[entityId].balance
		return featureCusEnts.reduce((sum, cusEnt) => {
			const rolloverSum = cusEnt.rollovers.reduce((rSum, rollover) => {
				const entityRollover = rollover.entities?.[entityId];
				if (entityRollover) {
					return new Decimal(rSum).add(entityRollover.balance || 0).toNumber();
				}
				return rSum;
			}, 0);
			return new Decimal(sum).add(rolloverSum).toNumber();
		}, 0);
	}
};

export const validateDeductionPossible = ({
	cusEnts,
	deductions,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	deductions: FeatureDeduction[];
	entityId?: string;
}) => {
	for (const { feature, deduction } of deductions) {
		const featureCusEnts = cusEnts.filter(
			(customerEntitlement) =>
				customerEntitlement.entitlement.internal_feature_id ===
				feature.internal_id,
		);

		// CONSTRAINT 1: Insufficient balance without usage_allowed
		const cusEntBalance = getFeatureBalance({
			cusEnts: featureCusEnts,
			internalFeatureId: feature.internal_id!,
			entityId,
		});

		// If unlimited, skip validation
		if (cusEntBalance === null) {
			continue;
		}
		const rolloverBalance = calculateAvailableRolloverBalance({
			cusEnts,
			feature,
			entityId,
		});
		const totalBalance = new Decimal(cusEntBalance)
			.add(rolloverBalance)
			.toNumber();

		const hasUsageAllowed = featureCusEnts.some(
			(customerEntitlement) => customerEntitlement.usage_allowed,
		);

		// Check if this is a "free" feature (single-use with included_usage but no pricing)
		// Only apply to SingleUse features; ContinuousUse (allocated) features should reject
		const isFreeFeature =
			feature.type === FeatureType.Metered &&
			feature.config?.usage_type === FeatureUsageType.Single &&
			featureCusEnts.some(
				(cusEnt) =>
					cusEnt.entitlement.allowance && cusEnt.entitlement.allowance > 0,
			) &&
			!hasUsageAllowed;

		// For free SingleUse features, allow tracking beyond balance (will cap at 0 in performDeduction)
		// For prepaid/allocated/other features without usage_allowed, reject insufficient balance
		if (totalBalance < deduction && !hasUsageAllowed && !isFreeFeature) {
			throw new RecaseError({
				message: `Insufficient balance for feature ${feature.id}. Available: ${totalBalance} (${cusEntBalance} + ${rolloverBalance} rollover), Required: ${deduction}`,
				code: ErrCode.InsufficientBalance,
				statusCode: StatusCodes.BAD_REQUEST,
				data: {
					feature_id: feature.id,
					available: totalBalance,
					cus_ent_balance: cusEntBalance,
					rollover_balance: rolloverBalance,
					required: deduction,
				},
			});
		}

		// CONSTRAINT 2: Usage limit exceeded for customer entitlements with usage_allowed
		const entitlementDeduction =
			new Decimal(deduction).sub(rolloverBalance).toNumber() > 0
				? new Decimal(deduction).sub(rolloverBalance).toNumber()
				: 0;

		if (entitlementDeduction > 0) {
			const featureCusEntsWithUsageAllowed = featureCusEnts.filter(
				(customerEntitlement) => customerEntitlement.usage_allowed,
			);

			const totalRemainingLimit = featureCusEntsWithUsageAllowed.reduce(
				(sum, cusEnt) => {
					const usageLimit = cusEnt.entitlement.usage_limit;
					if (!usageLimit) {
						return sum;
					}

					const featureBalance = getFeatureBalance({
						cusEnts: [cusEnt],
						internalFeatureId: feature.internal_id!,
						entityId,
					});

					// Skip if unlimited
					if (featureBalance === null) {
						return sum;
					}

					const allowance = new Decimal(cusEnt.entitlement.allowance || 0);
					const currentBalance = new Decimal(featureBalance);
					const currentUsed = allowance.sub(currentBalance);
					const remainingLimit = new Decimal(usageLimit).sub(currentUsed);

					return new Decimal(sum)
						.add(Decimal.max(0, remainingLimit))
						.toNumber();
				},
				0,
			);

			if (
				featureCusEntsWithUsageAllowed.length > 0 &&
				entitlementDeduction > totalRemainingLimit
			) {
				throw new RecaseError({
					message: `Usage limit exceeded for feature ${feature.id}. Total remaining capacity: ${totalRemainingLimit}, Requested from entitlement: ${entitlementDeduction} (${rolloverBalance} covered by rollovers)`,
					code: ErrCode.InsufficientBalance,
					statusCode: StatusCodes.BAD_REQUEST,
					data: {
						feature_id: feature.id,
						total_remaining_capacity: totalRemainingLimit,
						requested_from_entitlement: entitlementDeduction,
						covered_by_rollovers: rolloverBalance,
						total_requested: deduction,
					},
				});
			}
		}
	}
};
