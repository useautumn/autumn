import { fetchFeatures, fetchPlans } from "../../lib/api/endpoints/index.js";
import {
	transformApiFeature,
	transformApiPlan,
} from "../../lib/transforms/index.js";
import type { EnvironmentData } from "./types.js";

/**
 * Fetch and transform data from a single environment
 */
export async function pullFromEnvironment(
	secretKey: string,
): Promise<EnvironmentData> {
	// Fetch features and plans in parallel
	const [apiFeatures, apiPlans] = await Promise.all([
		fetchFeatures({ secretKey }),
		fetchPlans({ secretKey, includeArchived: true }),
	]);

	// Transform to SDK types
	const features = apiFeatures.map(transformApiFeature);
	const plans = apiPlans.map(transformApiPlan);

	return { features, plans };
}
