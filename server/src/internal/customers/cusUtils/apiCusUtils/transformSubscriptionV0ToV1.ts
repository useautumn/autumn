import {
	type ApiSubscriptionV0,
	type ApiSubscriptionV1,
	ApiSubscriptionV1Schema,
} from "@autumn/shared";

/**
 * Transform ApiSubscriptionV0 (V2.0) to ApiSubscriptionV1 (V2.1)
 * 
 * V2.1 changes:
 * - Renamed "default" → "auto_enable"
 */
export const transformSubscriptionV0ToV1 = ({
	subscription,
}: {
	subscription: ApiSubscriptionV0;
}): ApiSubscriptionV1 => {
	const { default: defaultValue, ...rest } = subscription;

	return ApiSubscriptionV1Schema.parse({
		...rest,
		auto_enable: defaultValue,
	});
};
