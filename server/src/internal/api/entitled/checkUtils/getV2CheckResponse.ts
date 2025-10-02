import {
	CheckResultSchema,
	type Feature,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomer,
	type Organization,
	SuccessCode,
} from "@autumn/shared";
import { cusEntMatchesFeature } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { balancesToFeatureResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/balancesToFeatureResponse.js";
import { getCusBalances } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusBalances.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { notNullish } from "@/utils/genUtils.js";

export const getFeatureToUse = ({
	creditSystems,
	feature,
	cusEnts,
}: {
	creditSystems: Feature[];
	feature: Feature;
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	// 1. If there's a credit system
	const featureCusEnts = cusEnts.filter((cusEnt) =>
		cusEntMatchesFeature({ cusEnt, feature }),
	);

	if (creditSystems.length > 0) {
		const creditCusEnts = cusEnts.filter((cusEnt) =>
			cusEntMatchesFeature({ cusEnt, feature: creditSystems[0] }),
		);

		if (creditCusEnts.length > 0) {
			return creditSystems[0];
		}

		if (featureCusEnts.length > 0) {
			return feature;
		}

		return creditSystems[0];
	}

	return feature;
};

export const getV2CheckResponse = async ({
	fullCus,
	cusEnts,
	feature,
	creditSystems,
	org,
	cusProducts,
	requiredBalance,
	apiVersion,
}: {
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
	creditSystems: Feature[];
	org: Organization;
	cusProducts: FullCusProduct[];
	requiredBalance?: number;
	apiVersion: number;
}) => {
	// 1. Get the feature to use
	const featureToUse = getFeatureToUse({
		creditSystems,
		feature,
		cusEnts,
	});

	const featureCusEnts = cusEnts.filter((cusEnt) =>
		cusEntMatchesFeature({ cusEnt, feature: featureToUse }),
	);

	const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
		cusEnts: featureCusEnts,
		internalFeatureId: featureToUse.internal_id!,
	});

	const cusPrices = cusProducts.flatMap(
		(cusProduct) => cusProduct.customer_prices,
	);

	const balances = await getCusBalances({
		cusEntsWithCusProduct: featureCusEnts,
		cusPrices,
		org,
		entity: fullCus.entity,
		apiVersion,
	});

	const cusFeatures = balancesToFeatureResponse({
		cusEnts: featureCusEnts,
		balances,
	});

	const cusFeature = cusFeatures[featureToUse.id] || {};

	let allowed = false;

	const totalPaidUsageAllowance = featureCusEnts.reduce((acc, ce) => {
		const ent = ce.entitlement;
		if (notNullish(ent.usage_limit)) {
			return acc + ent.usage_limit! - (ent.allowance || 0);
		}
		return acc;
	}, 0);

	if (
		(cusFeature && unlimited) ||
		usageAllowed ||
		(requiredBalance && requiredBalance < 0) ||
		cusFeature.balance + totalPaidUsageAllowance >= (requiredBalance || 1)
	) {
		allowed = true;
	}

	let finalRequired = notNullish(requiredBalance) ? requiredBalance : 1;
	if (featureToUse.type === FeatureType.CreditSystem) {
		finalRequired = featureToCreditSystem({
			featureId: feature.id,
			creditSystem: featureToUse,
			amount: finalRequired!,
		});
	}

	return CheckResultSchema.parse({
		customer_id: fullCus.id,
		feature_id: featureToUse.id,
		entity_id: fullCus.entity?.id,
		// required_balance: notNullish(requiredBalance) ? requiredBalance : 1,
		required_balance: finalRequired,
		code: SuccessCode.FeatureFound,
		allowed,
		...cusFeature,
	});
};
