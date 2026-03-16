// API helpers for test state verification
// These are lazy-loaded to ensure dotenv has run first

import type { Feature } from "../src/compose/models/featureModels.js";
import type { Plan } from "../src/compose/models/planModels.js";
import { fetchFeatures, fetchPlans } from "../src/lib/api/endpoints/index.js";
import type { ApiFeature } from "../src/lib/api/types/feature.js";
import type { ApiPlan } from "../src/lib/api/types/index.js";
import { readFromEnv } from "../src/lib/utils.js";

// Re-export types for convenience
export type { Feature, Plan, ApiPlan, ApiFeature };

export async function getAllPlans(params?: {
	archived?: boolean;
}): Promise<ApiPlan[]> {
	const secretKey = readFromEnv();
	if (!secretKey) {
		throw new Error("No API key found. Run `atmn login` first.");
	}
	return fetchPlans({ secretKey, includeArchived: params?.archived ?? true });
}

export async function getFeatures(params?: {
	includeArchived?: boolean;
}): Promise<ApiFeature[]> {
	const secretKey = readFromEnv();
	if (!secretKey) {
		throw new Error("No API key found. Run `atmn login` first.");
	}
	return fetchFeatures({
		secretKey,
		includeArchived: params?.includeArchived ?? true,
	});
}
