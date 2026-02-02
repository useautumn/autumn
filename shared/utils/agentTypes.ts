/**
 * Agent Types - Types and converters for the AI pricing agent
 *
 * The "Agent" format is a simplified, AI-friendly format used by the pricing agent.
 * It uses string literals like "single_use" instead of enums, making it easier for
 * LLMs to generate and for users to read.
 *
 * This module provides:
 * - TypeScript interfaces for the agent format
 * - Converters: AgentFeature ↔ Feature, AgentProduct ↔ ProductV2
 */

import {
	FeatureType,
	FeatureUsageType,
} from "../models/featureModels/featureEnums.js";
import type { Feature } from "../models/featureModels/featureModels.js";
import { AppEnv } from "../models/genModels/genEnums.js";
import { Infinite } from "../models/productModels/productEnums.js";
import type { ProductItem } from "../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../models/productV2Models/productV2Models.js";

// ============ INTERFACES ============

export type AgentFeatureType =
	| "static"
	| "boolean"
	| "single_use"
	| "continuous_use"
	| "credit_system";

export interface AgentFeature {
	id: string;
	name?: string | null;
	type: AgentFeatureType;
	display?: {
		singular: string;
		plural: string;
	} | null;
	credit_schema?: Array<{
		metered_feature_id: string;
		credit_cost: number;
	}> | null;
}

export interface AgentProductItem {
	feature_id?: string | null;
	included_usage?: number | "inf" | null;
	interval?: string | null;
	price?: number | null;
	tiers?: Array<{ to: number | "inf"; amount: number }> | null;
	usage_model?: "prepaid" | "pay_per_use" | null;
	billing_units?: number | null;
}

export interface AgentFreeTrial {
	length: number;
	duration: "day" | "month" | "year";
	unique_fingerprint?: boolean;
	card_required?: boolean;
}

export interface AgentProduct {
	id: string;
	name: string;
	is_add_on?: boolean;
	is_default?: boolean;
	group?: string;
	items?: AgentProductItem[];
	free_trial?: AgentFreeTrial | null;
}

export interface AgentPricingConfig {
	features: AgentFeature[];
	products: AgentProduct[];
}

// ============ AGENT → SHARED CONVERTERS ============

function mapAgentTypeToFeatureType(agentType: AgentFeatureType): FeatureType {
	switch (agentType) {
		case "boolean":
		case "static":
			return FeatureType.Boolean;
		case "credit_system":
			return FeatureType.CreditSystem;
		default:
			return FeatureType.Metered;
	}
}

function mapAgentTypeToUsageType(
	agentType: AgentFeatureType,
): FeatureUsageType | null {
	switch (agentType) {
		case "single_use":
			return FeatureUsageType.Single;
		case "continuous_use":
			return FeatureUsageType.Continuous;
		default:
			return null;
	}
}

/** Convert AgentFeature → Feature (shared DB type) */
export function agentFeatureToFeature(agentFeature: AgentFeature): Feature {
	const usageType = mapAgentTypeToUsageType(agentFeature.type);

	const config: Record<string, unknown> = {};
	if (usageType) {
		config.usage_type = usageType;
	}
	if (agentFeature.credit_schema) {
		config.schema = agentFeature.credit_schema.map((s) => ({
			metered_feature_id: s.metered_feature_id,
			credit_amount: s.credit_cost,
		}));
	}

	return {
		internal_id: agentFeature.id,
		org_id: "",
		created_at: Date.now(),
		env: AppEnv.Sandbox,
		id: agentFeature.id,
		name: agentFeature.name ?? agentFeature.display?.plural ?? agentFeature.id,
		type: mapAgentTypeToFeatureType(agentFeature.type),
		config: Object.keys(config).length > 0 ? config : null,
		display: agentFeature.display ?? undefined,
		archived: false,
		event_names: [],
	};
}

/** Convert AgentProductItem → ProductItem (shared DB type) */
export function agentItemToProductItem(item: AgentProductItem): ProductItem {
	return {
		feature_id: item.feature_id ?? undefined,
		included_usage:
			item.included_usage === "inf"
				? Infinite
				: (item.included_usage ?? undefined),
		interval: item.interval as ProductItem["interval"],
		price: item.price ?? undefined,
		billing_units: item.billing_units ?? undefined,
		usage_model: item.usage_model as ProductItem["usage_model"],
		tiers: item.tiers?.map((t) => ({
			to: t.to === "inf" ? Infinite : t.to,
			amount: t.amount,
		})),
	};
}

/** Convert AgentProduct → ProductV2 (shared DB type) */
export function agentProductToProductV2(product: AgentProduct): ProductV2 {
	return {
		internal_id: product.id,
		id: product.id,
		name: product.name,
		description: null,
		is_add_on: product.is_add_on ?? false,
		is_default: product.is_default ?? false,
		version: 1,
		group: product.group ?? null,
		env: AppEnv.Sandbox,
		free_trial: null, // Handled separately in preview transformations
		items: (product.items ?? []).map(agentItemToProductItem),
		created_at: Date.now(),
	};
}

// ============ SHARED → AGENT CONVERTERS ============

function mapFeatureTypeToAgentType(feature: Feature): AgentFeatureType {
	if (feature.type === FeatureType.CreditSystem) {
		return "credit_system";
	}

	if (feature.type === FeatureType.Boolean) {
		return "boolean";
	}

	if (feature.type === FeatureType.Metered) {
		const usageType = feature.config?.usage_type;
		if (
			usageType === "continuous_use" ||
			usageType === FeatureUsageType.Continuous
		) {
			return "continuous_use";
		}
		return "single_use";
	}

	return "static";
}

/** Convert Feature → AgentFeature */
export function featureToAgentFeature(feature: Feature): AgentFeature {
	const agentFeature: AgentFeature = {
		id: feature.id,
		name: feature.name,
		type: mapFeatureTypeToAgentType(feature),
	};

	if (feature.display?.singular || feature.display?.plural) {
		agentFeature.display = {
			singular: feature.display.singular ?? feature.name,
			plural: feature.display.plural ?? feature.name,
		};
	}

	if (feature.type === FeatureType.CreditSystem && feature.config?.schema) {
		agentFeature.credit_schema = feature.config.schema.map(
			(s: { metered_feature_id: string; credit_amount: number }) => ({
				metered_feature_id: s.metered_feature_id,
				credit_cost: s.credit_amount,
			}),
		);
	}

	return agentFeature;
}

/** Convert ProductItem → AgentProductItem */
export function productItemToAgentItem(item: ProductItem): AgentProductItem {
	const agentItem: AgentProductItem = {};

	if (item.feature_id) {
		agentItem.feature_id = item.feature_id;
	}

	if (item.included_usage !== undefined && item.included_usage !== null) {
		agentItem.included_usage =
			item.included_usage === Infinite ? "inf" : item.included_usage;
	}

	if (item.interval) {
		agentItem.interval = item.interval;
	}

	if (item.price !== undefined && item.price !== null) {
		agentItem.price = item.price;
	}

	// Copy tiers if present (tiered pricing)
	if (item.tiers && item.tiers.length > 0) {
		agentItem.tiers = item.tiers.map((t) => ({
			to: t.to === Infinite ? "inf" : t.to,
			amount: t.amount,
		}));
	}

	if (item.usage_model) {
		agentItem.usage_model = item.usage_model as "prepaid" | "pay_per_use";
	}

	if (item.billing_units) {
		agentItem.billing_units = item.billing_units;
	}

	return agentItem;
}

/** Convert ProductV2 → AgentProduct */
export function productV2ToAgentProduct(product: ProductV2): AgentProduct {
	const agentProduct: AgentProduct = {
		id: product.id,
		name: product.name,
	};

	if (product.is_add_on) {
		agentProduct.is_add_on = true;
	}

	if (product.is_default) {
		agentProduct.is_default = true;
	}

	if (product.group) {
		agentProduct.group = product.group;
	}

	if (product.items && product.items.length > 0) {
		agentProduct.items = product.items.map(productItemToAgentItem);
	}

	if (product.free_trial) {
		agentProduct.free_trial = {
			length: product.free_trial.length,
			duration: product.free_trial.duration as "day" | "month" | "year",
			unique_fingerprint: product.free_trial.unique_fingerprint,
			card_required: product.free_trial.card_required,
		};
	}

	return agentProduct;
}

/** Convert ProductV2[] and Feature[] → AgentPricingConfig */
export function convertToAgentConfig({
	products,
	features,
}: {
	products: ProductV2[];
	features: Feature[];
}): AgentPricingConfig {
	return {
		features: features.map(featureToAgentFeature),
		products: products.map(productV2ToAgentProduct),
	};
}
