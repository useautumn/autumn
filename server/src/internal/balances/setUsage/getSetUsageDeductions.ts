import {
	CusProductStatus,
	cusEntToIncludedUsage,
	cusProductsToCusEnts,
	type Feature,
	FeatureType,
	getRelevantFeatures,
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
import type { FeatureDeduction } from "../track/trackUtils/getFeatureDeductions.js";

// Helper: Check if cusEnts has balance for a feature
const cusEntsHasFeatureBalance = ({
	cusEnts,
	featureInternalId,
}: {
	cusEnts: ReturnType<typeof cusProductsToCusEnts>;
	featureInternalId: string;
}): boolean => {
	const balance = getFeatureBalance({
		cusEnts,
		internalFeatureId: featureInternalId,
		entityId: undefined,
	});
	return balance !== null && balance > 0;
};

// 2. Get deductions for each feature
export const getSetUsageDeductions = async ({
	ctx,
	setUsageParams,
}: {
	ctx: AutumnContext;
	setUsageParams: SetUsageParams;
}): Promise<FeatureDeduction[]> => {
	const { db, org, env, features: allFeatures } = ctx;
	const { value, entity_id } = setUsageParams;

	const fullCus = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: setUsageParams.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		entityId: setUsageParams.entity_id,
	});

	// Find the target feature
	const targetFeature = allFeatures.find(
		(f) => f.id === setUsageParams.feature_id,
	);
	if (!targetFeature) {
		throw new RecaseError({
			message: `Feature ${setUsageParams.feature_id} not found`,
			code: "feature_not_found",
		});
	}

	const isSettingCreditSystem = targetFeature.type === FeatureType.CreditSystem;

	// Find credit systems that contain this feature
	const creditSystems = getCreditSystemsFromFeature({
		featureId: targetFeature.id,
		features: allFeatures,
	});

	// Get cusEnts for the target feature
	const targetFeatureCusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		reverseOrder: org.config?.reverse_deduction_order,
		featureId: targetFeature.id,
	});

	// Check if customer has balance for the target feature directly
	const hasTargetFeatureBalance = cusEntsHasFeatureBalance({
		cusEnts: targetFeatureCusEnts,
		featureInternalId: targetFeature.internal_id!,
	});

	// Check if customer has balance for any credit system containing this feature
	const creditSystemWithBalance = creditSystems.find((cs) => {
		const csCusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			reverseOrder: org.config?.reverse_deduction_order,
			featureId: cs.id,
		});
		return cusEntsHasFeatureBalance({
			cusEnts: csCusEnts,
			featureInternalId: cs.internal_id!,
		});
	});

	// Validate: can't have both regular feature and credit system (unless setting credit system itself)
	if (!isSettingCreditSystem && hasTargetFeatureBalance && creditSystemWithBalance) {
		throw new RecaseError({
			message: `Cannot set usage for feature '${targetFeature.id}' because customer has both direct feature entitlements and credit system entitlements. Please use one or the other.`,
			code: "dual_deduction_not_allowed",
		});
	}

	// Determine which feature to use for deductions
	const deductionFeature = creditSystemWithBalance || targetFeature;
	const deductionFeatureId = deductionFeature.id;

	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		reverseOrder: org.config?.reverse_deduction_order,
		featureId: deductionFeatureId,
	});

	const { unlimited } = getUnlimitedAndUsageAllowed({
		cusEnts,
		internalFeatureId: deductionFeature.internal_id!,
	});

	if (unlimited) {
		return [];
	}

	const totalAllowance = sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToIncludedUsage({ cusEnt, entityId: setUsageParams.entity_id }),
		),
	);

	console.log("totalAllowance", totalAllowance);

	// Calculate target balance based on whether we're using credit system
	let targetBalance: number;
	if (creditSystemWithBalance && !isSettingCreditSystem) {
		// Feature is part of a credit system: targetBalance = totalAllowance - (credit_cost * value)
		const creditCost = getCreditCost({
			featureId: targetFeature.id,
			creditSystem: creditSystemWithBalance,
			amount: value,
		});
		targetBalance = new Decimal(totalAllowance).sub(creditCost).toNumber();
	} else {
		// Regular feature or setting credit system directly: targetBalance = totalAllowance - value
		targetBalance = new Decimal(totalAllowance).sub(value).toNumber();
	}

	const totalBalance = getFeatureBalance({
		cusEnts,
		internalFeatureId: deductionFeature.internal_id!,
		entityId: entity_id,
	})!;

	const deduction = new Decimal(totalBalance).sub(targetBalance).toNumber();

	if (deduction === 0) {
		console.log(`   - Skipping feature ${deductionFeature.id} -- deduction is 0`);
		return [];
	}

	return [{ feature: deductionFeature, deduction }];
};
