import type { ApiSubjectV0 } from "@api/customers/apiSubjectV0";
import { usageLimitFilterMatchesProperties } from "@models/cusModels/billingControls/usageLimit";
import type { Feature } from "@models/featureModels/featureModels";
import { hasCreditDimensionRules } from "@utils/featureUtils/classifyFeature/hasCreditDimensionRules";
import { Decimal } from "decimal.js";

type CreditRateLookup = {
	metered_feature_id: string;
	credit_amount?: number;
	feature_amount?: number;
	tier_behavior?: string;
	dimensions?: Record<string, unknown> | null;
	multipliers?: Record<string, unknown> | null;
};

const capHeadroom = (cap: { limit: number; usage?: number | null }) =>
	Decimal.max(0, new Decimal(cap.limit).sub(cap.usage ?? 0));

const isFlatCreditRate = (
	item: CreditRateLookup,
): item is CreditRateLookup & { credit_amount: number } =>
	item.credit_amount != null &&
	item.tier_behavior !== "graduated" &&
	!hasCreditDimensionRules(item);

/** Usage-window headroom in the evaluated feature's units. */
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
	// Entity subjects see inherited customer entries via
	// mergeCustomerBillingControlsForCheck; entity's own entry wins per feature.
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

	headrooms.push(...applicableCaps(feature.id).map(capHeadroom));

	const memberRate =
		originalFeature && originalFeature.id !== feature.id
			? feature.config?.schema?.find(
					(item: { metered_feature_id: string }) =>
						item.metered_feature_id === originalFeature.id,
				)
			: undefined;

	if (originalFeature && memberRate && isFlatCreditRate(memberRate)) {
		headrooms.push(
			...applicableCaps(originalFeature.id).map((cap) =>
				capHeadroom(cap)
					.mul(memberRate.credit_amount)
					.div(memberRate.feature_amount ?? 1),
			),
		);
	}

	if (headrooms.length === 0) return null;
	return Decimal.min(...headrooms).toNumber();
};
