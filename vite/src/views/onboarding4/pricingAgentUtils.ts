import type { PricingTier } from "./templateConfigs";

/**
 * Types for the pricing config returned by the AI agent's build_pricing tool
 */
export interface AgentFeature {
	id: string;
	name?: string | null;
	type:
		| "static"
		| "boolean"
		| "single_use"
		| "continuous_use"
		| "credit_system";
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

/**
 * Transform an AgentPricingConfig (from the AI) into PricingTier[] (for the UI)
 */
export function transformConfigToTiers({
	config,
	features,
}: {
	config: AgentPricingConfig;
	features: AgentFeature[];
}): PricingTier[] {
	return config.products.map((product) => {
		// Find the base price (item without feature_id, or first priced item)
		const basePrice = product.items?.find(
			(item) => !item.feature_id && item.price != null,
		);
		const fixedPrice = basePrice?.price ?? 0;
		const interval = basePrice?.interval ?? "month";

		// Determine price display
		let priceDisplay: string;
		if (
			fixedPrice === 0 &&
			!product.items?.some((i) => i.price && i.price > 0)
		) {
			priceDisplay = "Free";
		} else if (fixedPrice > 0) {
			priceDisplay = `$${fixedPrice}`;
		} else {
			// Usage-based only
			priceDisplay = "Usage-based";
		}

		// Build feature list for the card
		const featureList: string[] = [];

		for (const item of product.items ?? []) {
			if (item.feature_id) {
				const feature = features.find((f) => f.id === item.feature_id);
				const featureName =
					feature?.name ?? feature?.display?.plural ?? item.feature_id;

				if (item.included_usage === "inf") {
					featureList.push(`Unlimited ${featureName}`);
				} else if (item.included_usage != null && item.included_usage > 0) {
					featureList.push(
						`${item.included_usage.toLocaleString()} ${featureName}`,
					);
				} else if (item.price != null && item.price > 0) {
					featureList.push(
						`${featureName} at $${item.price}${item.billing_units ? `/${item.billing_units}` : "/unit"}`,
					);
				}
			} else if (item.price != null && item.price > 0 && !basePrice) {
				// It's a standalone price item
				featureList.push(`$${item.price}/${item.interval ?? "month"} base`);
			}
		}

		// Add free trial info if present
		if (product.free_trial) {
			featureList.push(
				`${product.free_trial.length} ${product.free_trial.duration} free trial`,
			);
		}

		// Determine if this tier should be highlighted
		// Typically the "Pro" or middle tier, or explicitly named
		const isHighlighted =
			product.name.toLowerCase().includes("pro") ||
			product.name.toLowerCase().includes("plus") ||
			product.name.toLowerCase().includes("premium");

		return {
			name: product.name,
			price: priceDisplay,
			interval: fixedPrice > 0 ? interval : undefined,
			description: product.is_add_on ? "Add-on" : undefined,
			features: featureList.length > 0 ? featureList : ["Basic features"],
			highlighted: isHighlighted,
		};
	});
}
