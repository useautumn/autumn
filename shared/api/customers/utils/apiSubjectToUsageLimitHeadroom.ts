import type { ApiSubjectV0 } from "@api/customers/apiSubjectV0";
import type { Feature } from "@models/featureModels/featureModels";
import { Decimal } from "decimal.js";

/**
 * Remaining usage-window headroom for a check, in the EVALUATED feature's
 * units (credits when the evaluated feature is a credit system). Considers
 * both the cap on the evaluated feature itself and -- when checking a
 * credit-system member -- the metered cap on the original feature, converted
 * via its credit cost. Null when no armed cap applies.
 */
export const apiSubjectToUsageLimitHeadroom = ({
	apiSubject,
	feature,
	originalFeature,
}: {
	apiSubject: ApiSubjectV0;
	feature: Feature;
	originalFeature?: Feature;
}): number | null => {
	// Entity subjects see inherited customer entries via
	// mergeCustomerBillingControlsForCheck; entity's own entry wins per feature.
	const billingControls = apiSubject.billing_controls;
	const usageLimits =
		billingControls && "usage_limits" in billingControls
			? billingControls.usage_limits
			: undefined;
	if (!usageLimits || usageLimits.length === 0) return null;

	const headrooms: Decimal[] = [];

	const capOnEvaluated = usageLimits.find(
		(usageLimit) => usageLimit.feature_id === feature.id,
	);
	if (capOnEvaluated) {
		headrooms.push(
			Decimal.max(
				0,
				new Decimal(capOnEvaluated.limit).sub(capOnEvaluated.usage ?? 0),
			),
		);
	}

	if (originalFeature && originalFeature.id !== feature.id) {
		const capOnOriginal = usageLimits.find(
			(usageLimit) => usageLimit.feature_id === originalFeature.id,
		);
		const schemaItem = feature.config?.schema?.find(
			(item: { metered_feature_id: string }) =>
				item.metered_feature_id === originalFeature.id,
		);
		if (capOnOriginal && schemaItem) {
			const headroomUnits = Decimal.max(
				0,
				new Decimal(capOnOriginal.limit).sub(capOnOriginal.usage ?? 0),
			);
			headrooms.push(headroomUnits.mul(schemaItem.credit_amount ?? 1));
		}
	}

	if (headrooms.length === 0) return null;
	return Decimal.min(...headrooms).toNumber();
};
