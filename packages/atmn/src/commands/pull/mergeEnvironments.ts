import type { Feature, Plan } from "../../compose/models/index.js";
import type { EnvironmentData } from "./types.js";

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

	// Merge plans (dedupe by ID)
	const planMap = new Map<string, Plan>();

	// Add sandbox plans first
	for (const plan of sandbox.plans) {
		planMap.set(plan.id, plan);
	}

	// Add production plans that don't exist in sandbox
	for (const plan of production.plans) {
		if (!planMap.has(plan.id)) {
			planMap.set(plan.id, plan);
		}
	}

	return {
		features: Array.from(featureMap.values()),
		plans: Array.from(planMap.values()),
	};
}
