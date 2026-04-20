import {
	apiBalanceToAllowed,
	CheckResponseV3Schema,
	FeatureType,
} from "@autumn/shared";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";

export const getCheckResponseV2 = async ({
	checkData,
	requiredBalance,
}: {
	checkData: CheckDataV2;
	requiredBalance: number;
}) => {
	const {
		customerId,
		entityId,
		apiBalance,
		apiFlag,
		originalFeature,
		featureToUse,
		evaluationApiBalance,
		evaluationApiFlag,
		evaluationApiSubject,
	} = checkData;

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

	if (!evaluationApiBalance && !evaluationApiFlag) {
		return CheckResponseV3Schema.parse({
			allowed: false,
			customer_id: customerId || "",
			entity_id: entityId,
			required_balance: requiredBalance,
			balance: apiBalance ?? null,
			flag: apiFlag ?? null,
		});
	}

	const allowed = evaluationApiFlag
		? true
		: evaluationApiBalance
			? apiBalanceToAllowed({
					apiBalance: evaluationApiBalance,
					apiSubject: evaluationApiSubject,
					feature: featureToUse,
					requiredBalance,
				}).allowed
			: false;

	return CheckResponseV3Schema.parse({
		allowed,
		customer_id: customerId || "",
		entity_id: entityId,
		required_balance: requiredBalance,
		balance: apiBalance ?? null,
		flag: apiFlag ?? null,
	});
};
