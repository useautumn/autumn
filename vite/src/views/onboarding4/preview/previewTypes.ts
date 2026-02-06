import {
	type AgentFeature,
	type AgentPricingConfig,
	type AgentProduct,
	type AgentProductItem,
	agentFeatureToFeature,
	agentItemToProductItem,
	agentProductToProductV2,
	type Feature,
	getProductItemDisplay,
	isOneOffProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import {
	type BasePriceDisplayResult,
	getBasePriceDisplay,
} from "@/utils/product/basePriceDisplayUtils";

/**
 * Preview-friendly product format derived from AgentPricingConfig
 */
export interface PreviewProduct {
	id: string;
	name: string;
	description?: string;
	isAddOn?: boolean;
	isDefault?: boolean;
	isOneOff: boolean;
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

		// Normalize items for isOneOffProductV2 check (undefined → null for interval)
		// This is needed because agentItemToProductItem may leave interval as undefined,
		// but isOneOffProductV2 checks for interval === null
		const normalizedItems = productV2.items.map((item) => ({
			...item,
			interval: item.interval ?? null,
		}));
		const isOneOff = isOneOffProductV2({ items: normalizedItems });

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
			isOneOff,
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

// ============ CHANGE DETECTION ============

/** Normalize falsy values for comparison (undefined, null, false all become false) */
function normalizeBool(val: boolean | undefined | null): boolean {
	return val === true;
}

/** Normalize optional strings (undefined, null, and empty string all become null) */
function normalizeStr(val: string | undefined | null): string | null {
	return val || null;
}

/** Normalize optional numbers */
function normalizeNum(
	val: number | "inf" | undefined | null,
): number | "inf" | null {
	return val ?? null;
}

function areItemsEqual(
	items1: AgentProductItem[],
	items2: AgentProductItem[],
): boolean {
	if (items1.length !== items2.length) return false;

	return items1.every((item1, index) => {
		const item2 = items2[index];
		return (
			normalizeStr(item1.feature_id) === normalizeStr(item2.feature_id) &&
			normalizeNum(item1.included_usage) ===
				normalizeNum(item2.included_usage) &&
			normalizeStr(item1.interval) === normalizeStr(item2.interval) &&
			normalizeNum(item1.price) === normalizeNum(item2.price) &&
			normalizeStr(item1.usage_model) === normalizeStr(item2.usage_model) &&
			normalizeNum(item1.billing_units) === normalizeNum(item2.billing_units) &&
			JSON.stringify(item1.tiers ?? null) ===
				JSON.stringify(item2.tiers ?? null)
		);
	});
}

function areProductsEqual(
	product1: AgentProduct,
	product2: AgentProduct,
): boolean {
	if (
		product1.name !== product2.name ||
		normalizeBool(product1.is_add_on) !== normalizeBool(product2.is_add_on) ||
		normalizeBool(product1.is_default) !== normalizeBool(product2.is_default) ||
		normalizeStr(product1.group) !== normalizeStr(product2.group)
	) {
		return false;
	}

	// Compare free trial (both falsy = equal)
	const ft1 = product1.free_trial;
	const ft2 = product2.free_trial;
	const hasFt1 = ft1 != null;
	const hasFt2 = ft2 != null;
	if (hasFt1 !== hasFt2) return false;
	if (ft1 && ft2) {
		if (ft1.length !== ft2.length || ft1.duration !== ft2.duration) {
			return false;
		}
	}

	// Compare items
	const items1 = product1.items ?? [];
	const items2 = product2.items ?? [];
	return areItemsEqual(items1, items2);
}

/** Returns a Set of product IDs that have changed from the initial config */
export function getChangedProductIds({
	initialConfig,
	currentConfig,
}: {
	initialConfig: AgentPricingConfig | null;
	currentConfig: AgentPricingConfig | null;
}): Set<string> {
	const changedIds = new Set<string>();

	if (!initialConfig || !currentConfig) {
		return changedIds;
	}

	const initialProductMap = new Map(
		initialConfig.products.map((p) => [p.id, p]),
	);

	for (const currentProduct of currentConfig.products) {
		const initialProduct = initialProductMap.get(currentProduct.id);

		// New product (wasn't in initial config)
		if (!initialProduct) {
			changedIds.add(currentProduct.id);
			continue;
		}

		// Existing product - check if changed
		if (!areProductsEqual(initialProduct, currentProduct)) {
			changedIds.add(currentProduct.id);
		}
	}

	return changedIds;
}

function areFreeTrialsEqual(
	ft1: AgentProduct["free_trial"],
	ft2: AgentProduct["free_trial"],
): boolean {
	if (!ft1 && !ft2) return true;
	if (!ft1 || !ft2) return false;
	return ft1.length === ft2.length && ft1.duration === ft2.duration;
}

/** Returns product IDs that will create new versions (existing + customers + billing changes) */
export function getVersionedProductIds({
	initialConfig,
	currentConfig,
	productCounts,
}: {
	initialConfig: AgentPricingConfig | null;
	currentConfig: AgentPricingConfig | null;
	productCounts: Record<string, { all: number }>;
}): string[] {
	if (!initialConfig || !currentConfig) return [];

	const initialProductMap = new Map(
		initialConfig.products.map((p) => [p.id, p]),
	);

	return currentConfig.products
		.filter((currentProduct) => {
			const initialProduct = initialProductMap.get(currentProduct.id);
			if (!initialProduct) return false;

			const customerCount = productCounts[currentProduct.id]?.all ?? 0;
			if (customerCount === 0) return false;

			const itemsChanged = !areItemsEqual(
				initialProduct.items ?? [],
				currentProduct.items ?? [],
			);
			const freeTrialChanged = !areFreeTrialsEqual(
				initialProduct.free_trial,
				currentProduct.free_trial,
			);

			return itemsChanged || freeTrialChanged;
		})
		.map((product) => product.id);
}

/** Check if two credit system features are equal */
function areFeaturesEqual(
	feature1: AgentFeature,
	feature2: AgentFeature,
): boolean {
	if (feature1.name !== feature2.name || feature1.type !== feature2.type) {
		return false;
	}

	// Compare display - only if BOTH features have display defined
	// The display field is cosmetic (UI labels) and doesn't affect billing.
	// If one has display and the other doesn't, it's not a meaningful change.
	const d1 = feature1.display;
	const d2 = feature2.display;
	if (d1 && d2) {
		if (d1.singular !== d2.singular || d1.plural !== d2.plural) {
			return false;
		}
	}

	// Compare credit schema
	const cs1 = feature1.credit_schema ?? [];
	const cs2 = feature2.credit_schema ?? [];
	if (cs1.length !== cs2.length) return false;
	return cs1.every((s1, index) => {
		const s2 = cs2[index];
		return (
			s1.metered_feature_id === s2.metered_feature_id &&
			s1.credit_cost === s2.credit_cost
		);
	});
}

/** Returns a Set of feature IDs that have changed from the initial config */
export function getChangedFeatureIds({
	initialConfig,
	currentConfig,
}: {
	initialConfig: AgentPricingConfig | null;
	currentConfig: AgentPricingConfig | null;
}): Set<string> {
	const changedIds = new Set<string>();

	if (!initialConfig || !currentConfig) {
		return changedIds;
	}

	const initialFeatureMap = new Map(
		initialConfig.features.map((f) => [f.id, f]),
	);

	for (const currentFeature of currentConfig.features) {
		const initialFeature = initialFeatureMap.get(currentFeature.id);

		// New feature (wasn't in initial config)
		if (!initialFeature) {
			changedIds.add(currentFeature.id);
			continue;
		}

		// Existing feature - check if changed
		if (!areFeaturesEqual(initialFeature, currentFeature)) {
			changedIds.add(currentFeature.id);
		}
	}

	return changedIds;
}

// ============ PRODUCT GROUPING ============

export interface GroupedPreviewProducts {
	subscriptions: PreviewProduct[];
	addOnSubscriptions: PreviewProduct[];
	oneTimePlans: PreviewProduct[];
}

/** Groups products into subscriptions, add-on subscriptions, and one-time plans (mirrors ProductListTable logic) */
export function groupPreviewProducts(
	products: PreviewProduct[],
): GroupedPreviewProducts {
	const oneTimePlans = products.filter((p) => p.isOneOff);
	const recurringPlans = products.filter((p) => !p.isOneOff);

	const subscriptions = recurringPlans.filter((p) => !p.isAddOn);
	const addOnSubscriptions = recurringPlans.filter((p) => p.isAddOn);

	return { subscriptions, addOnSubscriptions, oneTimePlans };
}
