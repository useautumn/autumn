import {
	ApiFeatureType,
	type CheckResult,
	CheckResultSchema,
	FeatureType,
	SuccessCode,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeature } from "@/internal/customers/cusUtils/apiCusUtils/getApiCusFeature/getApiCusFeature.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { CheckData } from "../checkTypes/CheckData.js";

export const getV2CheckResponse = async ({
	ctx,
	checkData,
	requiredBalance,
	// fullCus,
	// cusEnts,
	// feature,
	// creditSystems,
	// cusProducts,
	// requiredBalance,
	// apiVersion,
}: {
	ctx: AutumnContext;
	checkData: CheckData;
	requiredBalance: number;
	// fullCus: FullCustomer;
	// cusEnts: FullCusEntWithFullCusProduct[];
	// feature: Feature;
	// creditSystems: Feature[];
	// cusProducts: FullCusProduct[];
	// requiredBalance?: number;
	// apiVersion: ApiVersionClass;
}) => {
	const { fullCus, cusEnts, originalFeature, featureToUse, cusProducts } =
		checkData;

	// If credit system used, need to convert required balance to credit system required balance
	if (
		featureToUse.type === FeatureType.CreditSystem &&
		featureToUse.id !== originalFeature.id
	) {
		requiredBalance = featureToCreditSystem({
			featureId: originalFeature.id,
			creditSystem: featureToUse,
			amount: requiredBalance,
		});
	}

	// if (cusEnts.length === 0) {
	// 	return CheckResultSchema.parse({
	// 		allowed: false,
	// 		customer_id: fullCus.id || fullCus.internal_id,
	// 		feature_id: featureToUse.id,
	// 		required_balance: requiredBalance,
	// 		code: SuccessCode.FeatureFound,
	// 	});
	// }

	const apiCusFeature = getApiCusFeature({
		ctx,
		fullCus,
		cusEnts,
		feature: featureToUse,
	});

	// 1. Boolean or static
	let allowed = false;

	// Case 1: Boolean or static
	if (
		apiCusFeature.type === ApiFeatureType.Boolean ||
		apiCusFeature.type === ApiFeatureType.Static
	) {
		console.log("Boolean or static");
		allowed = true;
	}

	// Case 2: Unlimited or overage allowed
	if (apiCusFeature.unlimited || apiCusFeature.overage_allowed) {
		console.log("Unlimited or overage allowed");
		allowed = true;
	}

	// Case 3: Required balance is negative
	if (requiredBalance < 0) {
		console.log("Required balance is negative");
		allowed = true;
	}

	// Case 4: Balance + total paid usage allowance >= required balance [does this fail for prepaid...]
	const totalPaidUsageAllowance = cusEnts.reduce((acc, ce) => {
		const ent = ce.entitlement;
		if (notNullish(ent.usage_limit)) {
			return acc + ent.usage_limit - (ent.allowance || 0);
		}
		return acc;
	}, 0);

	if (
		apiCusFeature.balance &&
		new Decimal(apiCusFeature.balance)
			.plus(totalPaidUsageAllowance)
			.gte(requiredBalance)
	) {
		console.log("Balance + total paid usage allowance >= required balance");
		allowed = true;
	}

	// Case 4: No customer entitlements, should be false
	if (cusEnts.length === 0) {
		allowed = false;
	}

	return CheckResultSchema.parse({
		allowed,
		customer_id: fullCus.id || fullCus.internal_id,
		feature_id: featureToUse.id,
		entity_id: fullCus.entity?.id,
		required_balance: requiredBalance,
		code: SuccessCode.FeatureFound,
		...apiCusFeature,
	} satisfies CheckResult);

	// return;

	// const featureCusEnts = cusEnts.filter((cusEnt) =>
	// 	cusEntMatchesFeature({ cusEnt, feature: featureToUse }),
	// );

	// const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
	// 	cusEnts: featureCusEnts,
	// 	internalFeatureId: featureToUse.internal_id!,
	// });

	// const cusPrices = cusProducts.flatMap(
	// 	(cusProduct) => cusProduct.customer_prices,
	// );

	// const balances = await getCusBalances({
	// 	cusEntsWithCusProduct: featureCusEnts,
	// 	cusPrices,
	// 	org,
	// 	entity: fullCus.entity,
	// 	apiVersion,
	// });

	// const cusFeatures = balancesToFeatureResponse({
	// 	cusEnts: featureCusEnts,
	// 	balances,
	// });

	// const cusFeature = cusFeatures[featureToUse.id] || {};

	// let allowed = false;

	// // const totalPaidUsageAllowance = featureCusEnts.reduce((acc, ce) => {
	// // 	const ent = ce.entitlement;
	// // 	if (notNullish(ent.usage_limit)) {
	// // 		return acc + ent.usage_limit - (ent.allowance || 0);
	// // 	}
	// // 	return acc;
	// // }, 0);

	// if (
	// 	(cusFeature && unlimited) ||
	// 	usageAllowed ||
	// 	(requiredBalance && requiredBalance < 0) ||
	// 	cusFeature.balance + totalPaidUsageAllowance >= (requiredBalance || 1)
	// ) {
	// 	allowed = true;
	// }

	// let finalRequired = notNullish(requiredBalance) ? requiredBalance : 1;
	// if (featureToUse.type === FeatureType.CreditSystem) {
	// 	finalRequired = featureToCreditSystem({
	// 		featureId: feature.id,
	// 		creditSystem: featureToUse,
	// 		amount: finalRequired,
	// 	});
	// }

	// return CheckResultSchema.parse({
	// 	customer_id: fullCus.id,
	// 	feature_id: featureToUse.id,
	// 	entity_id: fullCus.entity?.id,
	// 	// required_balance: notNullish(requiredBalance) ? requiredBalance : 1,
	// 	required_balance: finalRequired,
	// 	code: SuccessCode.FeatureFound,
	// 	allowed,
	// 	...cusFeature,
	// });
};
