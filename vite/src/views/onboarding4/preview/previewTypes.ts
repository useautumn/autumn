import {
	AppEnv,
	type Feature,
	FeatureType,
	getProductItemDisplay,
	Infinite,
	type ProductItem,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import {
	type BasePriceDisplayResult,
	getBasePriceDisplay,
} from "@/utils/product/basePriceDisplayUtils";
import type {
	AgentFeature,
	AgentProduct,
	AgentProductItem,
} from "../pricingAgentUtils";

/**
 * Preview-friendly product format derived from AgentPricingConfig
 */
export interface PreviewProduct {
	id: string;
	name: string;
	description?: string;
	isAddOn?: boolean;
	isDefault?: boolean;
	basePrice: BasePriceDisplayResult;
	items: PreviewProductItem[];
	freeTrial?: {
		length: number;
		duration: string;
	};
}

export interface PreviewProductItem {
	featureId: string;
	featureName: string;
	featureType: AgentFeature["type"];
	includedUsage?: number | "inf";
	price?: number;
	usageModel?: "prepaid" | "pay_per_use";
	billingUnits?: number;
	interval?: string;
	display: {
		primaryText: string;
		secondaryText?: string;
	};
}

/**
 * Transform AgentPricingConfig products into preview-ready format
 */
export function transformToPreviewProducts({
	products,
	features,
}: {
	products: AgentProduct[];
	features: AgentFeature[];
}): PreviewProduct[] {
	// Convert agent features to shared Feature type for display function
	const sharedFeatures = features.map(agentFeatureToFeature);

	return products.map((product) => {
		// Convert to ProductV2 → FrontendProduct to use existing getBasePriceDisplay
		const productV2 = agentProductToProductV2(product);
		const frontendProduct = productV2ToFrontendProduct({ product: productV2 });
		const basePrice = getBasePriceDisplay({ product: frontendProduct });

		// Transform feature items
		const featureItems = (product.items ?? [])
			.filter((item) => item.feature_id)
			.map((item) =>
				transformToPreviewItem({ item, features, sharedFeatures }),
			);

		return {
			id: product.id,
			name: product.name,
			isAddOn: product.is_add_on,
			isDefault: product.is_default,
			basePrice,
			items: featureItems,
			freeTrial: product.free_trial
				? {
						length: product.free_trial.length,
						duration: product.free_trial.duration,
					}
				: undefined,
		};
	});
}

/**
 * Convert AgentProduct to ProductV2 for use with shared utilities
 */
function agentProductToProductV2(product: AgentProduct): ProductV2 {
	const items: ProductItem[] = (product.items ?? []).map(
		agentItemToProductItem,
	);

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
		free_trial: null, // Free trial display handled separately in PreviewProduct
		items,
		created_at: Date.now(),
	};
}

/**
 * Map AgentFeature type string to FeatureType enum
 */
function mapFeatureType(agentType: AgentFeature["type"]): FeatureType {
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

/**
 * Convert AgentFeature to shared Feature type
 */
function agentFeatureToFeature(agentFeature: AgentFeature): Feature {
	return {
		internal_id: agentFeature.id,
		org_id: "",
		created_at: Date.now(),
		env: AppEnv.Sandbox,
		id: agentFeature.id,
		name: agentFeature.name ?? agentFeature.display?.plural ?? agentFeature.id,
		type: mapFeatureType(agentFeature.type),
		config: null,
		display: agentFeature.display
			? {
					singular: agentFeature.display.singular,
					plural: agentFeature.display.plural,
				}
			: undefined,
		archived: false,
		event_names: [],
	};
}

/**
 * Convert AgentProductItem to shared ProductItem type
 */
function agentItemToProductItem(item: AgentProductItem): ProductItem {
	return {
		feature_id: item.feature_id,
		included_usage:
			item.included_usage === "inf"
				? Infinite
				: (item.included_usage ?? undefined),
		interval: item.interval as ProductItem["interval"],
		price: item.price,
		billing_units: item.billing_units,
		usage_model: item.usage_model as ProductItem["usage_model"],
		tiers:
			item.price != null ? [{ to: Infinite, amount: item.price }] : undefined,
	};
}

function transformToPreviewItem({
	item,
	features,
	sharedFeatures,
}: {
	item: AgentProductItem;
	features: AgentFeature[];
	sharedFeatures: Feature[];
}): PreviewProductItem {
	const agentFeature = features.find((f) => f.id === item.feature_id);
	const featureName =
		agentFeature?.name ??
		agentFeature?.display?.plural ??
		item.feature_id ??
		"Feature";
	const featureType = agentFeature?.type ?? "single_use";

	// Use shared getProductItemDisplay function
	const productItem = agentItemToProductItem(item);
	const displayResult = getProductItemDisplay({
		item: productItem,
		features: sharedFeatures,
		currency: "USD",
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	return {
		featureId: item.feature_id ?? "",
		featureName,
		featureType,
		includedUsage: item.included_usage ?? undefined,
		price: item.price ?? undefined,
		usageModel: item.usage_model ?? undefined,
		billingUnits: item.billing_units ?? undefined,
		interval: item.interval ?? undefined,
		display: {
			primaryText: displayResult.primary_text,
			secondaryText: displayResult.secondary_text ?? undefined,
		},
	};
}
