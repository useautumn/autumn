import {
	AffectedResource,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	CusEntResponseSchema,
	type Feature,
	FeatureType,
	LATEST_VERSION,
} from "@autumn/shared";

/**
 * Transforms feature balances to API format for requested version
 *
 * Latest format (V1_2):
 * - Object keyed by feature_id
 * - Has usage/included_usage fields (not used/allowance)
 *
 * V1_1:
 * - Array format
 * - Has usage/included_usage fields
 *
 * V1_0:
 * - Array format (split response, not in customer object)
 * - Has used/allowance fields
 */
export const getApiCusFeature = ({
	balances,
	features,
	apiVersion,
}: {
	balances: any[]; // Raw balances from getCusBalances
	features: Feature[]; // Feature definitions
	apiVersion: ApiVersion;
}): any => {
	// Transform balances to latest format (V1_1+: usage/included_usage)
	const transformedBalances = balances.map((b) => {
		const isBoolean =
			features.find((f: Feature) => f.id === b.feature_id)?.type ===
			FeatureType.Boolean;

		if (b.unlimited || isBoolean) {
			return b;
		}

		return CusEntResponseSchema.parse({
			...b,
			usage: b.used,
			included_usage: b.allowance,
		});
	});

	// Build in latest format (V1_2: object keyed by feature_id)
	const featuresObject: Record<string, any> = {};
	for (const balance of transformedBalances) {
		featuresObject[balance.feature_id] = balance;
	}

	// Apply version changes to transform to requested version
	// V1_2 stays as object
	// V1_1 → array (via V1_2_FeaturesArrayToObject transform)
	return applyResponseVersionChanges({
		input: featuresObject,
		currentVersion: new ApiVersionClass(LATEST_VERSION),
		targetVersion: new ApiVersionClass(apiVersion),
		resource: AffectedResource.CusFeature,
	});
};
