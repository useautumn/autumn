import {
	fetchFeatures,
	fetchPlans,
	fetchReferralPrograms,
	fetchRewards,
} from "../../lib/api/endpoints/index.js";
import {
	transformApiFeature,
	transformApiPlans,
	transformApiReferralProgram,
	transformApiReward,
} from "../../lib/transforms/index.js";
import type { EnvironmentData } from "./types.js";

/**
 * Fetch and transform data from a single environment
 */
export async function pullFromEnvironment(
	secretKey: string,
	options: { allVersions?: boolean } = {},
): Promise<EnvironmentData> {
	const { allVersions = false } = options;
	// Fetch features and plans in parallel
	const [apiFeatures, apiPlans, apiRewards, apiPrograms] = await Promise.all([
		fetchFeatures({ secretKey }),
		fetchPlans({ secretKey, includeArchived: true, allVersions }),
		fetchRewards({ secretKey }),
		fetchReferralPrograms({ secretKey }),
	]);

	// Transform to SDK types
	const features = apiFeatures.map(transformApiFeature);
	const plans = transformApiPlans(apiPlans, { allVersions });

	return {
		features,
		plans,
		rewards: [...apiRewards.coupons, ...apiRewards.feature_grants].map(
			transformApiReward,
		),
		referralPrograms: apiPrograms.referral_programs.map(
			transformApiReferralProgram,
		),
	};
}
