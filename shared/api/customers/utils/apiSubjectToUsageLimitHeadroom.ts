import type { ApiSubjectV0 } from "@api/customers/apiSubjectV0";
import { usageLimitFilterMatchesProperties } from "@models/cusModels/billingControls/usageLimit";
import type { Feature } from "@models/featureModels/featureModels";
import { Decimal } from "decimal.js";

export const apiSubjectToUsageLimitHeadroom = ({
	apiSubject,
	feature,
	originalFeature,
	properties,
}: {
	apiSubject: ApiSubjectV0;
	feature: Feature;
	originalFeature?: Feature;
	properties?: Record<string, unknown> | null;
}): number | null => {
	const billingControls = apiSubject.billing_controls;
	const usageLimits =
		billingControls && "usage_limits" in billingControls
			? billingControls.usage_limits
			: undefined;
	if (!usageLimits || usageLimits.length === 0) return null;

	const headrooms: Decimal[] = [];

	const applicableCaps = (featureId: string) =>
		usageLimits.filter(
			(usageLimit) =>
				usageLimit.feature_id === featureId &&
				usageLimit.enabled !== false &&
				usageLimitFilterMatchesProperties({
					filterProperties: usageLimit.filter?.properties ?? null,
					eventProperties: properties,
				}),
		);

	for (const capOnEvaluated of applicableCaps(feature.id)) {
		headrooms.push(
			Decimal.max(
				0,
				new Decimal(capOnEvaluated.limit).sub(capOnEvaluated.usage ?? 0),
			),
		);
	}

	if (originalFeature && originalFeature.id !== feature.id) {
		const schemaItem = feature.config?.schema?.find(
			(item: { metered_feature_id: string }) =>
				item.metered_feature_id === originalFeature.id,
		);
		if (schemaItem) {
			for (const capOnOriginal of applicableCaps(originalFeature.id)) {
				const headroomUnits = Decimal.max(
					0,
					new Decimal(capOnOriginal.limit).sub(capOnOriginal.usage ?? 0),
				);
				headrooms.push(
					headroomUnits
						.mul(schemaItem.credit_amount ?? 1)
						.div(schemaItem.feature_amount ?? 1),
				);
			}
		}
	}

	if (headrooms.length === 0) return null;
	return Decimal.min(...headrooms).toNumber();
};
