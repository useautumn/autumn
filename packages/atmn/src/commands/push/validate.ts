import type { Feature, Plan, PlanItem } from "../../compose/models/index.js";

/**
 * Validation errors with user-friendly messages.
 */
export interface ValidationError {
	path: string;
	message: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

/**
 * Get the price.interval from a PlanItem (handling the discriminated union)
 */
function getPriceInterval(
	feature: PlanItem,
): { interval: string; intervalCount?: number } | undefined {
	if (!feature.price) return undefined;
	const price = feature.price as { interval?: string; intervalCount?: number };
	if (price.interval) {
		return { interval: price.interval, intervalCount: price.intervalCount };
	}
	return undefined;
}

/**
 * Check if a feature is consumable (single_use style) based on its type
 */
function isConsumableFeature(feature: Feature): boolean {
	if (feature.type === "boolean") return false;
	if (feature.type === "credit_system") return true;
	if (feature.type === "metered") {
		return (feature as { consumable?: boolean }).consumable === true;
	}
	return false;
}

/**
 * Check if a feature is continuous-use (like seats) based on its type
 */
function _isContinuousUseFeature(feature: Feature): boolean {
	if (feature.type === "metered") {
		return (feature as { consumable?: boolean }).consumable === false;
	}
	return false;
}

/**
 * Validate a plan item has all required fields.
 */
function validatePlanFeature(
	planFeature: PlanItem,
	planId: string,
	featureIndex: number,
	features: Feature[],
): ValidationError[] {
	const errors: ValidationError[] = [];
	const featureId = planFeature.featureId || `(no featureId)`;
	const basePath = `plan "${planId}" → items[${featureIndex}] (${featureId})`;

	// Look up the actual feature definition
	const featureDefinition = features.find(
		(f) => f.id === planFeature.featureId,
	);

	// Get reset configuration from either top-level or price.interval
	const topLevelReset = planFeature.reset;
	const priceInterval = getPriceInterval(planFeature);
	const hasTopLevelReset = topLevelReset !== undefined;
	const hasPriceInterval = priceInterval !== undefined;
	const hasAnyReset = hasTopLevelReset || hasPriceInterval;

	// ========== MUTUAL EXCLUSIVITY ==========
	// Cannot have both top-level reset AND price.interval
	if (hasTopLevelReset && hasPriceInterval) {
		errors.push({
			path: basePath,
			message: `Cannot have both "reset" and "price.interval". Use "reset" for free allocations, or "price.interval" for usage-based pricing.`,
		});
	}

	// ========== FEATURE TYPE VALIDATIONS ==========
	if (featureDefinition) {
		// Boolean features cannot have reset
		if (featureDefinition.type === "boolean" && hasAnyReset) {
			errors.push({
				path: basePath,
				message: `Boolean features cannot have a reset interval. Remove the "reset" configuration.`,
			});
		}

		// Consumable features require reset when they have usage limits (but not if unlimited)
		if (isConsumableFeature(featureDefinition)) {
			const hasFiniteUsageLimits =
				planFeature.included !== undefined && planFeature.unlimited !== true;
			const hasPricing = planFeature.price !== undefined;

			// If the feature has finite usage limits or pricing, it needs a reset interval
			// Unlimited features don't need a reset interval
			if ((hasFiniteUsageLimits || hasPricing) && !hasAnyReset) {
				errors.push({
					path: basePath,
					message: `Consumable features require a reset interval. Add "reset: { interval: 'month' }" or "price: { interval: 'month', ... }".`,
				});
			}
		}
	}

	// ========== PRICE VALIDATION ==========
	if (planFeature.price) {
		// billingMethod is required when price is defined
		if (!(planFeature.price as { billingMethod?: string }).billingMethod) {
			errors.push({
				path: `${basePath} → price`,
				message: `"billingMethod" is required when "price" is defined. Must be "prepaid" or "usage_based".`,
			});
		}

		// If price has amount or tiers, must have either top-level reset OR price.interval
		if (
			(planFeature.price.amount !== undefined || planFeature.price.tiers) &&
			!hasAnyReset
		) {
			errors.push({
				path: basePath,
				message: `Pricing requires a reset interval. Add "price: { interval: 'month', ... }".`,
			});
		}
	}

	// ========== RESET INTERVAL VALIDATION ==========
	const validIntervals = [
		"one_off",
		"hour",
		"day",
		"week",
		"month",
		"quarter",
		"semi_annual",
		"year",
	];

	// Validate top-level reset interval
	if (hasTopLevelReset) {
		if (
			topLevelReset.interval === undefined ||
			topLevelReset.interval === null
		) {
			errors.push({
				path: `${basePath} → reset`,
				message: `"interval" is required when "reset" is specified. Must be one of: ${validIntervals.join(", ")}.`,
			});
		} else if (!validIntervals.includes(topLevelReset.interval)) {
			errors.push({
				path: `${basePath} → reset.interval`,
				message: `Invalid interval "${topLevelReset.interval}". Must be one of: ${validIntervals.join(", ")}.`,
			});
		}
	}

	// Validate price.interval
	if (hasPriceInterval) {
		if (!validIntervals.includes(priceInterval.interval)) {
			errors.push({
				path: `${basePath} → price.interval`,
				message: `Invalid interval "${priceInterval.interval}". Must be one of: ${validIntervals.join(", ")}.`,
			});
		}
	}

	return errors;
}

/**
 * Validate a plan has all required fields.
 */
function validatePlan(plan: Plan, features: Feature[]): ValidationError[] {
	const errors: ValidationError[] = [];
	const planId = plan.id || "(no id)";

	// id is required
	if (!plan.id) {
		errors.push({
			path: "plan",
			message: `"id" is required.`,
		});
	}

	// name is required
	if (!plan.name) {
		errors.push({
			path: `plan "${planId}"`,
			message: `"name" is required.`,
		});
	}

	// If price is defined, validate it
	if (plan.price) {
		if (plan.price.amount === undefined) {
			errors.push({
				path: `plan "${planId}" → price`,
				message: `"amount" is required when "price" is defined.`,
			});
		}
		if (!plan.price.interval) {
			errors.push({
				path: `plan "${planId}" → price`,
				message: `"interval" is required when "price" is defined (e.g., interval: "month").`,
			});
		}
	}

	// If autoEnable is true and freeTrial.card_required is true, that's invalid
	// Customers shouldn't be auto-enrolled in a trial that requires card input
	if (plan.autoEnable === true && plan.freeTrial?.cardRequired === true) {
		errors.push({
			path: `plan "${planId}"`,
			message: `"auto_enable" cannot be true when "free_trial.card_required" is true. Customers cannot be auto-enrolled in a trial that requires card input.`,
		});
	}

	// Validate each plan feature
	if (plan.items && Array.isArray(plan.items)) {
		for (let i = 0; i < plan.items.length; i++) {
			const planFeature = plan.items[i];
			if (planFeature) {
				// featureId is required
				if (!planFeature.featureId) {
					errors.push({
						path: `plan "${planId}" → items[${i}]`,
						message: `"featureId" is required.`,
					});
				}
				errors.push(...validatePlanFeature(planFeature, planId, i, features));
			}
		}
	}

	return errors;
}

/**
 * Validate a feature has all required fields.
 */
function validateFeature(feature: Feature): ValidationError[] {
	const errors: ValidationError[] = [];
	const featureId = feature.id || "(no id)";

	// id is required
	if (!feature.id) {
		errors.push({
			path: "feature",
			message: `"id" is required.`,
		});
	}

	// name is required
	if (!feature.name) {
		errors.push({
			path: `feature "${featureId}"`,
			message: `"name" is required.`,
		});
	}

	// type is required
	if (!feature.type) {
		errors.push({
			path: `feature "${featureId}"`,
			message: `"type" is required. Must be "boolean", "metered", or "credit_system".`,
		});
	}

	// If type is metered, consumable is required
	if (feature.type === "metered") {
		const meteredFeature = feature as { consumable?: boolean };
		if (meteredFeature.consumable === undefined) {
			errors.push({
				path: `feature "${featureId}"`,
				message: `"consumable" is required for metered features. Set to true (usage is consumed) or false (usage accumulates).`,
			});
		}
	}

	// If type is credit_system, creditSchema is required
	if (feature.type === "credit_system") {
		if (!feature.creditSchema || feature.creditSchema.length === 0) {
			errors.push({
				path: `feature "${featureId}"`,
				message: `"creditSchema" is required for credit_system features.`,
			});
		}
	}

	return errors;
}

/**
 * Validate local config before pushing.
 *
 * This catches missing required fields and provides helpful error messages
 * before the API returns confusing Zod validation errors.
 */
export function validateConfig(
	features: Feature[],
	plans: Plan[],
): ValidationResult {
	const errors: ValidationError[] = [];

	// Validate features
	for (const feature of features) {
		errors.push(...validateFeature(feature));
	}

	// Validate plans (passing features for feature type lookups)
	for (const plan of plans) {
		errors.push(...validatePlan(plan, features));
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Format validation errors for console output.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
	const lines: string[] = [];

	for (const error of errors) {
		lines.push(`  ${error.path}`);
		lines.push(`    ${error.message}`);
		lines.push("");
	}

	return lines.join("\n");
}
