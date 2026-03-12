import type { ApiSpendLimit } from "@api/billingControls";
import type { Feature } from "@models/featureModels/featureModels";
import type { ApiSubjectV0 } from "../apiSubjectV0";

export const apiSubjectToSpendLimit = ({
	subject,
	feature,
}: {
	subject: ApiSubjectV0;
	feature: Feature;
}): ApiSpendLimit | undefined => {
	if (!("billing_controls" in subject) || !subject.billing_controls) {
		return undefined;
	}

	if (!("spend_limits" in subject.billing_controls)) {
		return undefined;
	}

	const spendLimits = subject.billing_controls.spend_limits ?? [];

	return spendLimits.find(
		(spendLimit) =>
			spendLimit.enabled &&
			spendLimit.feature_id === feature.id &&
			spendLimit.overage_limit !== undefined,
	);
};
