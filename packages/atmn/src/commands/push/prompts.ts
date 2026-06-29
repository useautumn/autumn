import type { Feature, Plan } from "../../compose/models/index.js";
import { AppEnv } from "../../lib/env/index.js";
import type { FeatureDeleteInfo, PlanDeleteInfo } from "./types.js";

/**
 * Types for push prompts
 */

export type PromptType =
	| "prod_confirmation"
	| "plan_versioning"
	| "plan_migration"
	| "plan_variant_propagation"
	| "plan_delete_has_customers"
	| "plan_delete_no_customers"
	| "plan_archived"
	| "feature_delete_credit_system"
	| "feature_delete_products"
	| "feature_delete_no_deps"
	| "feature_archived";

export interface PromptOption {
	label: string;
	value: string;
	description?: string;
	isDefault?: boolean;
}

export interface PushPrompt {
	id: string;
	type: PromptType;
	entityId: string;
	entityName: string;
	data: Record<string, unknown>;
	options: PromptOption[];
}

interface PlanVersioningPromptInfo {
	plan: Pick<Plan, "id" | "name">;
	scope?: "plan" | "variant";
	willVersion: boolean;
	isArchived: boolean;
	hasHistoricalVersions?: boolean;
}

interface PlanVariantPropagationPromptInfo {
	basePlanId: string;
	basePlanName: string;
	variant: {
		plan_id: string;
		name: string;
		versionable: boolean;
		customize?: unknown;
		conflicts?: unknown[];
	};
}

interface PlanVariantPropagationGroupPromptInfo {
	basePlanId: string;
	basePlanName: string;
	variants: PlanVariantPropagationPromptInfo["variant"][];
}

interface PlanMigrationPromptInfo {
	plan: Pick<Plan, "id" | "name">;
	scope?: "plan" | "variant";
}

// Counter for unique prompt IDs
let promptCounter = 0;

function generatePromptId(): string {
	return `prompt_${++promptCounter}`;
}

/**
 * Create production confirmation prompt
 */
export function createProdConfirmationPrompt(): PushPrompt {
	return {
		id: generatePromptId(),
		type: "prod_confirmation",
		entityId: "production",
		entityName: "Production Environment",
		data: {},
		options: [
			{ label: "Yes, I understand", value: "confirm", isDefault: false },
			{ label: "No, cancel", value: "cancel", isDefault: true },
		],
	};
}

/**
 * Create plan versioning prompt
 */
export function createPlanVersioningPrompt(
	info: PlanVersioningPromptInfo,
	env?: AppEnv,
): PushPrompt {
	return {
		id: generatePromptId(),
		type: "plan_versioning",
		entityId: info.plan.id,
		entityName: info.plan.name,
		data: {
			planId: info.plan.id,
			planName: info.plan.name,
			scope: info.scope ?? "plan",
		},
		options: [
			{
				label: "Create new version",
				description: "Existing customers stay on their current version.",
				value: "create_version",
				isDefault: env === AppEnv.Live,
			},
			{
				label: "Update existing version",
				description:
					"Update the current plan version now. You can migrate current users next.",
				value: "update_current",
				isDefault: env !== AppEnv.Live,
			},
			...(info.hasHistoricalVersions
				? [
						{
							label: "Update all versions",
							description:
								"Apply this change to every version of this plan and selected variants.",
							value: "update_all_versions",
							isDefault: false,
						},
					]
				: []),
		],
	};
}

export function createPlanMigrationPrompt(
	info: PlanMigrationPromptInfo,
): PushPrompt {
	return {
		id: generatePromptId(),
		type: "plan_migration",
		entityId: info.plan.id,
		entityName: info.plan.name,
		data: {
			planId: info.plan.id,
			planName: info.plan.name,
			scope: info.scope ?? "plan",
		},
		options: [
			{
				label: "Create migration draft",
				description: "Customers move only when you run the draft.",
				value: "create_migration",
				isDefault: false,
			},
			{
				label: "Do not create migration draft",
				value: "skip_migration",
				isDefault: true,
			},
		],
	};
}

export function createPlanVariantPropagationPrompt(
	info: PlanVariantPropagationPromptInfo,
): PushPrompt {
	const conflictCount = info.variant.conflicts?.length ?? 0;
	return {
		id: generatePromptId(),
		type: "plan_variant_propagation",
		entityId: info.variant.plan_id,
		entityName: info.variant.name,
		data: {
			basePlanId: info.basePlanId,
			basePlanName: info.basePlanName,
			variantPlanId: info.variant.plan_id,
			variantName: info.variant.name,
			versionable: info.variant.versionable,
			conflictCount,
			conflicts: info.variant.conflicts ?? [],
			customize: info.variant.customize,
		},
		options: [
			{
				label: "Apply base changes to this variant",
				value: "apply",
				isDefault: false,
			},
			{
				label: "Skip this variant",
				value: "skip",
				isDefault: true,
			},
		],
	};
}

export function createPlanVariantPropagationGroupPrompt(
	info: PlanVariantPropagationGroupPromptInfo,
): PushPrompt {
	return {
		id: generatePromptId(),
		type: "plan_variant_propagation",
		entityId: info.basePlanId,
		entityName: info.basePlanName,
		data: {
			basePlanId: info.basePlanId,
			basePlanName: info.basePlanName,
			variants: info.variants.map((variant) => ({
				variantPlanId: variant.plan_id,
				variantName: variant.name,
				versionable: variant.versionable,
				conflictCount: variant.conflicts?.length ?? 0,
				conflicts: variant.conflicts ?? [],
				customize: variant.customize,
			})),
		},
		options: [],
	};
}

/**
 * Create plan delete prompt when plan has customers
 */
export function createPlanDeleteHasCustomersPrompt(
	info: PlanDeleteInfo,
): PushPrompt {
	return {
		id: generatePromptId(),
		type: "plan_delete_has_customers",
		entityId: info.id,
		entityName: info.id,
		data: {
			planId: info.id,
			customerCount: info.customerCount,
			firstCustomerName: info.firstCustomerName || "Unknown Customer",
		},
		options: [
			{ label: "Archive instead", value: "archive", isDefault: true },
			{ label: "Skip (keep as is)", value: "skip", isDefault: false },
		],
	};
}

/**
 * Create plan delete prompt when plan has no customers
 */
export function createPlanDeleteNoCustomersPrompt(
	info: PlanDeleteInfo,
): PushPrompt {
	return {
		id: generatePromptId(),
		type: "plan_delete_no_customers",
		entityId: info.id,
		entityName: info.id,
		data: {
			planId: info.id,
		},
		options: [
			{ label: "Delete permanently", value: "delete", isDefault: true },
			{ label: "Skip (keep as is)", value: "skip", isDefault: false },
		],
	};
}

/**
 * Create plan archived prompt
 */
export function createPlanArchivedPrompt(plan: Plan): PushPrompt {
	return {
		id: generatePromptId(),
		type: "plan_archived",
		entityId: plan.id,
		entityName: plan.name,
		data: {
			planId: plan.id,
			planName: plan.name,
		},
		options: [
			{ label: "Un-archive and push", value: "unarchive", isDefault: true },
			{ label: "Skip this plan", value: "skip", isDefault: false },
		],
	};
}

/**
 * Create feature delete prompt when feature is used by credit system
 */
export function createFeatureDeleteCreditSystemPrompt(
	info: FeatureDeleteInfo,
): PushPrompt {
	const creditSystems = info.referencingCreditSystems || [];
	const firstCreditSystem = creditSystems[0] || "Unknown";

	return {
		id: generatePromptId(),
		type: "feature_delete_credit_system",
		entityId: info.id,
		entityName: info.id,
		data: {
			featureId: info.id,
			creditSystems,
			firstCreditSystem,
			creditSystemCount: creditSystems.length,
		},
		options: [
			{ label: "Archive instead", value: "archive", isDefault: true },
			{ label: "Skip (keep as is)", value: "skip", isDefault: false },
		],
	};
}

/**
 * Create feature delete prompt when feature is used by products
 */
export function createFeatureDeleteProductsPrompt(
	info: FeatureDeleteInfo,
): PushPrompt {
	const products = info.referencingProducts || { name: "Unknown", count: 1 };

	return {
		id: generatePromptId(),
		type: "feature_delete_products",
		entityId: info.id,
		entityName: info.id,
		data: {
			featureId: info.id,
			productName: products.name,
			productCount: products.count,
		},
		options: [
			{ label: "Archive instead", value: "archive", isDefault: true },
			{ label: "Skip (keep as is)", value: "skip", isDefault: false },
		],
	};
}

/**
 * Create feature delete prompt when feature has no dependencies
 */
export function createFeatureDeleteNoDepsPrompt(
	info: FeatureDeleteInfo,
): PushPrompt {
	return {
		id: generatePromptId(),
		type: "feature_delete_no_deps",
		entityId: info.id,
		entityName: info.id,
		data: {
			featureId: info.id,
		},
		options: [
			{ label: "Delete permanently", value: "delete", isDefault: true },
			{ label: "Skip (keep as is)", value: "skip", isDefault: false },
		],
	};
}

/**
 * Create feature archived prompt
 */
export function createFeatureArchivedPrompt(feature: Feature): PushPrompt {
	return {
		id: generatePromptId(),
		type: "feature_archived",
		entityId: feature.id,
		entityName: feature.name,
		data: {
			featureId: feature.id,
			featureName: feature.name,
		},
		options: [
			{ label: "Un-archive and push", value: "unarchive", isDefault: true },
			{
				label: "Skip this feature",
				value: "skip",
				isDefault: false,
			},
		],
	};
}

/**
 * Create appropriate delete prompt based on feature delete info
 */
export function createFeatureDeletePrompt(info: FeatureDeleteInfo): PushPrompt {
	if (info.reason === "credit_system") {
		return createFeatureDeleteCreditSystemPrompt(info);
	}
	if (info.reason === "products") {
		return createFeatureDeleteProductsPrompt(info);
	}
	return createFeatureDeleteNoDepsPrompt(info);
}

/**
 * Create appropriate delete prompt based on plan delete info
 */
export function createPlanDeletePrompt(info: PlanDeleteInfo): PushPrompt {
	if (info.customerCount > 0) {
		return createPlanDeleteHasCustomersPrompt(info);
	}
	return createPlanDeleteNoCustomersPrompt(info);
}

/**
 * Reset prompt counter (useful for testing)
 */
export function resetPromptCounter(): void {
	promptCounter = 0;
}
