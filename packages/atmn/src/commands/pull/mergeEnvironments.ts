import type { Feature } from "../../compose/models/index.js";
import type { Plan } from "../../compose/models/variantModels.js";
import type { EnvironmentData } from "./types.js";

const planKey = (plan: Plan) =>
	plan.version === undefined ? plan.id : `${plan.id}:${plan.version}`;

/**
 * Merge sandbox and production data for SDK types generation
 * Deduplicates by ID, preferring sandbox definitions
 */
export function mergeEnvironments(
	sandbox: EnvironmentData,
	production: EnvironmentData,
): EnvironmentData {
	// Merge features (dedupe by ID)
	const featureMap = new Map<string, Feature>();

	// Add sandbox features first
	for (const feature of sandbox.features) {
		featureMap.set(feature.id, feature);
	}

	// Add production features that don't exist in sandbox
	for (const feature of production.features) {
		if (!featureMap.has(feature.id)) {
			featureMap.set(feature.id, feature);
		}
	}

	// Merge plans (dedupe by ID + version)
	const planMap = new Map<string, Plan>();

	// Add sandbox plans first
	for (const plan of sandbox.plans) {
		planMap.set(planKey(plan), plan);
	}

	// Add production plans that don't exist in sandbox
	for (const plan of production.plans) {
		const key = planKey(plan);
		if (!planMap.has(key)) {
			planMap.set(key, plan);
		}
	}

	return {
		features: Array.from(featureMap.values()),
		plans: Array.from(planMap.values()),
	};
}
