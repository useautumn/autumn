import {
	CusProductStatus,
	cusEntToIncludedUsage,
	ErrCode,
	type Feature,
	FeatureNotFoundError,
	FeatureType,
	type FullCustomer,
	type FullCustomerEntitlement,
	fullCustomerToCustomerEntitlements,
	orgToInStatuses,
	RecaseError,
	type SetUsageParams,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusService } from "../../customers/CusService.js";
import {
	getFeatureBalance,
	getUnlimitedAndUsageAllowed,
} from "../../customers/cusProducts/cusEnts/cusEntUtils.js";
import {
	getCreditCost,
	getCreditSystemsFromFeature,
} from "../../features/creditSystemUtils.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";

// Helper: Check if cusEnts has balance for a feature
const cusEntsHasFeatureBalance = ({
	cusEnts,
	featureInternalId,
}: {
	cusEnts: FullCustomerEntitlement[];
	featureInternalId: string;
}) => {
	return cusEnts.some((cusEnt) => {
		if (cusEnt.internal_feature_id !== featureInternalId) {
			return false;
		}
		// Has balance if there's a numeric balance (including 0) or unlimited
		return cusEnt.balance !== null && cusEnt.balance !== undefined;
	});
};

// 2. Get deductions for each feature
export const getSetUsageDeductions = async ({
	ctx,
	setUsageParams,
	fullCustomer,
}: {
	ctx: AutumnContext;
	setUsageParams: SetUsageParams;
	fullCustomer: FullCustomer;
}): Promise<FeatureDeduction[]> => {
	const { org, features: allFeatures } = ctx;
	const { value, entity_id } = setUsageParams;

	const feature = allFeatures.find((f) => f.id === setUsageParams.feature_id);
	if (!feature) {
		throw new FeatureNotFoundError({
			featureId: setUsageParams.feature_id,
		});
	}

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		reverseOrder: org.config?.reverse_deduction_order,
		featureId: feature.id,
		inStatuses: orgToInStatuses({ org }),
	});

	// ==========================================
	// CREDIT SYSTEM DETECTION & VALIDATION
	// ==========================================

	// 1. Check if the feature being set is itself a credit system
	const isSettingCreditSystem = feature.type === FeatureType.CreditSystem;

	// 2. Find all credit systems that contain this feature
	const creditSystems = getCreditSystemsFromFeature({
		featureId: feature.id,
		features: allFeatures,
	});

	// 3. Validate: Customer should not have both regular feature balance AND credit system balance
	//    (unless we're setting the credit system itself)
	if (!isSettingCreditSystem && creditSystems.length > 0) {
		const hasRegularFeatureBalance = cusEntsHasFeatureBalance({
			cusEnts,
			featureInternalId: feature.internal_id!,
		});

		// Check each credit system
		for (const creditSystem of creditSystems) {
			const hasCreditSystemBalance = cusEntsHasFeatureBalance({
				cusEnts,
				featureInternalId: creditSystem.internal_id!,
			});

			// If customer has balance in BOTH, that's an error
			if (hasRegularFeatureBalance && hasCreditSystemBalance) {
				throw new RecaseError({
					message: `Customer has balance in both feature '${feature.id}' and credit system '${creditSystem.id}'. Cannot determine which to deduct from.`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		}
	}

	// ==========================================
	// SMART FEATURE SELECTION FOR DEDUCTION
	// ==========================================

	// 4. Decide which feature to deduct from: credit system or regular feature
	let deductionFeature: Feature = feature;

	// If customer has balance in a credit system, use that for deduction
	if (!isSettingCreditSystem && creditSystems.length > 0) {
		for (const creditSystem of creditSystems) {
			const hasCreditSystemBalance = cusEntsHasFeatureBalance({
				cusEnts,
				featureInternalId: creditSystem.internal_id!,
			});

			if (hasCreditSystemBalance) {
				deductionFeature = creditSystem;
				break;
			}
		}
	}

	// ==========================================
	// CALCULATE DEDUCTION
	// ==========================================

	const deductionCusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		reverseOrder: org.config?.reverse_deduction_order,
		featureId: deductionFeature.id,
		inStatuses: orgToInStatuses({ org }),
	});

	const { unlimited } = getUnlimitedAndUsageAllowed({
		cusEnts: deductionCusEnts,
		internalFeatureId: deductionFeature.internal_id!,
	});

	if (unlimited) {
		return [];
	}

	const totalAllowance = sumValues(
		deductionCusEnts.map((cusEnt) =>
			cusEntToIncludedUsage({ cusEnt, entityId: setUsageParams.entity_id }),
		),
	);

	// ==========================================
	// TARGET BALANCE CALCULATION
	// ==========================================

	let targetBalance: number;

	// If deducting from a credit system, calculate credit cost
	if (
		deductionFeature.type === FeatureType.CreditSystem &&
		deductionFeature.id !== feature.id
	) {
		// Calculate credit cost for the feature
		const creditCost = getCreditCost({
			featureId: feature.id,
			creditSystem: deductionFeature,
			amount: value,
		});

		targetBalance = new Decimal(totalAllowance).sub(creditCost).toNumber();
	} else {
		// Regular feature or setting the credit system itself: direct subtraction
		targetBalance = new Decimal(totalAllowance).sub(value).toNumber();
	}

	const totalBalance = getFeatureBalance({
		cusEnts: deductionCusEnts,
		internalFeatureId: deductionFeature.internal_id!,
		entityId: entity_id,
	})!;

	const deduction = new Decimal(totalBalance).sub(targetBalance).toNumber();

	if (deduction === 0) {
		console.log(
			`   - Skipping feature ${deductionFeature.id} -- deduction is 0`,
		);
		return [];
	}

	return [{ feature: deductionFeature, deduction }];
};
