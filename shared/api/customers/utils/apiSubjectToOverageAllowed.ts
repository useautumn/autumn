import type { ApiOverageAllowed } from "@api/billingControls";
import type { Feature } from "@models/featureModels/featureModels";
import type { ApiSubjectV0 } from "../apiSubjectV0";

export const apiSubjectToOverageAllowedControl = ({
	subject,
	feature,
}: {
	subject: ApiSubjectV0;
	feature: Feature;
}): ApiOverageAllowed | undefined => {
	if (!("billing_controls" in subject) || !subject.billing_controls) {
		return undefined;
	}

	if (!("overage_allowed" in subject.billing_controls)) {
		return undefined;
	}

	const overageAllowed = subject.billing_controls.overage_allowed ?? [];

	return overageAllowed.find((entry) => entry.feature_id === feature.id);
};
