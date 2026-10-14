import type { Feature, PlanItem } from "../../compose/models/index.js";
import type { Plan } from "../../compose/models/variantModels.js";

export interface ValidationError {
	path: string;
	message: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

const hasPlanLicenseCycle = (plans: Plan[]): boolean => {
	const byId = new Map(plans.map((plan) => [plan.id, plan]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (plan: Plan): boolean => {
		if (visiting.has(plan.id)) return true;
		if (visited.has(plan.id)) return false;
		visiting.add(plan.id);
		for (const license of plan.licenses ?? []) {
			const dependency = byId.get(license.licensePlanId);
			if (dependency !== plan && dependency && visit(dependency)) return true;
		}
		visiting.delete(plan.id);
		visited.add(plan.id);
		return false;
	};
	return plans.some(visit);
};

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

function isConsumableFeature(feature: Feature): boolean {
	if (feature.type === "boolean") return false;
	if (feature.type === "credit_system") return true;
	if (feature.type === "metered") {
		return (feature as { consumable?: boolean }).consumable === true;
	}
	return false;
}

function _isContinuousUseFeature(feature: Feature): boolean {
	if (feature.type === "metered") {
		return (feature as { consumable?: boolean }).consumable === false;
	}
	return false;
}

function validatePlanFeature(
	planFeature: PlanItem,
	planId: string,
	featureIndex: number,
	features: Feature[],
): ValidationError[] {
	const errors: ValidationError[] = [];
	const featureId = planFeature.featureId || `(no featureId)`;
	const basePath = `plan "${planId}" → items[${featureIndex}] (${featureId})`;

	const featureDefinition = features.find(
		(f) => f.id === planFeature.featureId,
	);
	if (planFeature.featureId && !featureDefinition) {
		errors.push({
			path: basePath,
			message: `Feature "${planFeature.featureId}" is referenced by this item but is not exported from your config.`,
		});
	}

	const topLevelReset = planFeature.reset;
	const priceInterval = getPriceInterval(planFeature);
	const hasTopLevelReset = topLevelReset !== undefined;
	const hasPriceInterval = priceInterval !== undefined;
	const hasAnyReset = hasTopLevelReset || hasPriceInterval;

	const hasDifferentResetAndPriceInterval =
		hasTopLevelReset &&
		hasPriceInterval &&
		(topLevelReset.interval !== priceInterval.interval ||
			(topLevelReset.intervalCount ?? 1) !==
				(priceInterval.intervalCount ?? 1));
	if (
		hasDifferentResetAndPriceInterval &&
		planFeature.price?.billingMethod !== "prepaid"
	) {
		errors.push({
			path: basePath,
			message:
				"reset.interval and price.interval can only differ for prepaid prices.",
		});
	}

	if (featureDefinition) {
		if (featureDefinition.type === "boolean" && hasAnyReset) {
			errors.push({
				path: basePath,
				message: `Boolean features cannot have a reset interval. Remove the "reset" configuration.`,
			});
		}

		if (isConsumableFeature(featureDefinition)) {
			const hasFiniteUsageLimits =
				planFeature.included !== undefined && planFeature.unlimited !== true;
			const hasPricing = planFeature.price !== undefined;

			if ((hasFiniteUsageLimits || hasPricing) && !hasAnyReset) {
				errors.push({
					path: basePath,
					message: `Consumable features require a reset interval. Add "reset: { interval: 'month' }" or "price: { interval: 'month', ... }".`,
				});
			}
		}
	}

	if (planFeature.price) {
		if (!(planFeature.price as { billingMethod?: string }).billingMethod) {
			errors.push({
				path: `${basePath} → price`,
				message: `"billingMethod" is required when "price" is defined. Must be "prepaid" or "usage_based".`,
			});
		}

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

function validateFeatureReference({
	featureId,
	features,
	path,
}: {
	featureId?: string;
	features: Feature[];
	path: string;
}): ValidationError[] {
	if (!featureId) {
		return [{ path, message: `"featureId" is required.` }];
	}
	if (features.some((feature) => feature.id === featureId)) return [];
	return [
		{
			path,
			message: `Feature "${featureId}" is referenced here but is not exported from your config.`,
		},
	];
}

function validatePlan(plan: Plan, features: Feature[]): ValidationError[] {
	const errors: ValidationError[] = [];
	const planId = plan.id || "(no id)";

	if (!plan.id) {
		errors.push({
			path: "plan",
			message: `"id" is required.`,
		});
	}

	if (!plan.name) {
		errors.push({
			path: `plan "${planId}"`,
			message: `"name" is required.`,
		});
	}

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

	if (plan.autoEnable === true && plan.freeTrial?.cardRequired === true) {
		errors.push({
			path: `plan "${planId}"`,
			message: `"auto_enable" cannot be true when "free_trial.card_required" is true. Customers cannot be auto-enrolled in a trial that requires card input.`,
		});
	}

	if (plan.items && Array.isArray(plan.items)) {
		for (let i = 0; i < plan.items.length; i++) {
			const planFeature = plan.items[i];
			if (planFeature) {
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

	for (const [variantIndex, variant] of (plan.variants ?? []).entries()) {
		const variantPath = `plan "${planId}" → variants[${variantIndex}] (${variant.id})`;
		for (const [itemIndex, item] of (
			variant.customize?.addItems ?? []
		).entries()) {
			if (!item.featureId) {
				errors.push({
					path: `${variantPath} → customize.addItems[${itemIndex}]`,
					message: `"featureId" is required.`,
				});
			}
			errors.push(
				...validatePlanFeature(
					item,
					`${planId}.${variant.id}`,
					itemIndex,
					features,
				),
			);
		}
		for (const [itemIndex, item] of (
			variant.customize?.removeItems ?? []
		).entries()) {
			errors.push(
				...validateFeatureReference({
					featureId: item.featureId,
					features,
					path: `${variantPath} → customize.removeItems[${itemIndex}]`,
				}),
			);
		}
	}

	return errors;
}

function validateFeature(feature: Feature): ValidationError[] {
	const errors: ValidationError[] = [];
	const featureId = feature.id || "(no id)";

	if (!feature.id) {
		errors.push({
			path: "feature",
			message: `"id" is required.`,
		});
	}

	if (!feature.name) {
		errors.push({
			path: `feature "${featureId}"`,
			message: `"name" is required.`,
		});
	}

	if (!feature.type) {
		errors.push({
			path: `feature "${featureId}"`,
			message: `"type" is required. Must be "boolean", "metered", or "credit_system".`,
		});
	}

	if (feature.type === "metered") {
		const meteredFeature = feature as { consumable?: boolean };
		if (meteredFeature.consumable === undefined) {
			errors.push({
				path: `feature "${featureId}"`,
				message: `"consumable" is required for metered features. Set to true (usage is consumed) or false (usage accumulates).`,
			});
		}
	}

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

export function validateConfig(
	features: Feature[],
	plans: Plan[],
): ValidationResult {
	const errors: ValidationError[] = [];

	for (const feature of features) {
		errors.push(...validateFeature(feature));
	}

	for (const plan of plans) {
		errors.push(...validatePlan(plan, features));
	}

	const localPlanIds = new Set(plans.map((plan) => plan.id));
	for (const plan of plans) {
		const seen = new Set<string>();
		for (const [index, license] of (plan.licenses ?? []).entries()) {
			const path = `plan "${plan.id}" → licenses[${index}]`;
			if (seen.has(license.licensePlanId)) {
				errors.push({
					path,
					message: `Duplicate license link "${license.licensePlanId}".`,
				});
			}
			seen.add(license.licensePlanId);
			if (!localPlanIds.has(license.licensePlanId)) {
				errors.push({
					path,
					message: `License plan "${license.licensePlanId}" is not exported from your config.`,
				});
			}
			if (license.licensePlanId === plan.id) {
				errors.push({ path, message: "A plan cannot license itself." });
			}
		}
	}
	if (hasPlanLicenseCycle(plans)) {
		errors.push({ path: "plans", message: "Plan dependency cycle detected" });
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

export function formatValidationErrors(errors: ValidationError[]): string {
	const lines: string[] = [];

	for (const error of errors) {
		lines.push(`  ${error.path}`);
		lines.push(`    ${error.message}`);
		lines.push("");
	}

	return lines.join("\n");
}
