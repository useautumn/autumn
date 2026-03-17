import type { Feature, Plan } from "../../compose/models/index.js";
import { AppEnv } from "../../lib/env/index.js";
import type {
	FeatureDeleteInfo,
	PlanDeleteInfo,
	PlanUpdateInfo,
} from "./types.js";

/**
 * Types for push prompts
 */

export type PromptType =
	| "prod_confirmation"
	| "plan_versioning"
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
	info: PlanUpdateInfo,
	env?: AppEnv,
): PushPrompt {
	const isSandbox = !env || env === AppEnv.Sandbox;
	return {
		id: generatePromptId(),
		type: "plan_versioning",
		entityId: info.plan.id,
		entityName: info.plan.name,
		data: {
			planId: info.plan.id,
			planName: info.plan.name,
		},
		options: [
			...(isSandbox
				? [
						{
							label: "Yes, migrate existing customers and create a new version",
							value: "version_and_migrate",
							isDefault: true,
						},
					]
				: []),
			{
				label: "Yes, but create a new version only",
				value: "version",
				isDefault: !isSandbox,
			},
			{ label: "No, skip this plan", value: "skip", isDefault: false },
		],
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
			{ label: "Archive instead", value: "archive", isDefault: false },
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
			{ label: "Archive instead", value: "archive", isDefault: false },
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
