import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type EventProperties,
	type Feature,
	type UsageLimitFilter,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";

export const findBlockedFilterOnSubject = ({
	subject,
	feature,
	eventProperties,
}: {
	subject: ApiCustomerV5 | ApiEntityV2;
	feature: Feature;
	eventProperties?: EventProperties;
}): UsageLimitFilter | undefined =>
	subject.billing_controls?.usage_limits?.find(
		(usageLimit) =>
			usageLimit.feature_id === feature.id &&
			usageLimit.enabled !== false &&
			usageLimit.filter != null &&
			usageLimitFilterMatchesProperties({
				filterProperties: usageLimit.filter.properties,
				eventProperties,
			}) &&
			(usageLimit.usage ?? 0) >= usageLimit.limit,
	)?.filter;
