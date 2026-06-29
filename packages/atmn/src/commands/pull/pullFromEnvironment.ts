import { fetchFeatures, fetchPlans } from "../../lib/api/endpoints/index.js";
import {
	transformApiFeature,
	transformApiPlans,
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
	const [apiFeatures, apiPlans] = await Promise.all([
		fetchFeatures({ secretKey }),
		fetchPlans({ secretKey, includeArchived: true, allVersions }),
	]);

	// Transform to SDK types
	const features = apiFeatures.map(transformApiFeature);
	const plans = transformApiPlans(apiPlans, { allVersions });

	return { features, plans };
}
