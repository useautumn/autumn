import { CheckResponseV3Schema, FeatureType } from "@autumn/shared";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import type { CheckData } from "../checkTypes/CheckData.js";
import { apiBalanceToAllowed } from "./apiBalanceToAllowed.js";

export const getV2CheckResponse = async ({
	checkData,
	requiredBalance,
}: {
	checkData: CheckData;
	requiredBalance: number;
}) => {
	const { customerId, entityId, apiBalance, originalFeature, featureToUse } =
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

	if (!apiBalance) {
		return CheckResponseV3Schema.parse({
			allowed: false,
			customer_id: customerId || "",
			entity_id: entityId,
			required_balance: requiredBalance,
			balance: null,
		});
	}

	const allowed = apiBalanceToAllowed({
		apiBalance,
		feature: featureToUse,
		requiredBalance,
		legacyData: checkData.cusFeatureLegacyData,
	});

	return CheckResponseV3Schema.parse({
		allowed,
		customer_id: customerId || "",
		entity_id: entityId,
		required_balance: requiredBalance,
		balance: apiBalance,
	});
};
