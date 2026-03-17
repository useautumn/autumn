// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared display utilities
// Run `pnpm gen:atmn` to regenerate


/**
 * Minimal translation from atmn PlanItem to ProductItem-like shape
 * This allows us to reuse display logic patterns from @autumn/shared
 *
 * NOTE: This is a simplified version for CLI preview. The full conversion
 * lives in @autumn/shared/utils/planFeatureUtils/planFeaturesToItems.ts
 */

import type { Feature, PlanItem } from "../../compose/index.js";

/**
 * Minimal ProductItem shape needed for display functions
 * Mirrors the fields used by getProductItemDisplay in @autumn/shared
 */
export interface ProductItemLike {
	feature_id: string | null;
	included_usage: number | "inf" | null;
	interval: string | null;
	interval_count: number | null;
	price: number | null;
	tiers: Array<{ to: number | "inf"; amount: number }> | null;
	billing_units: number | null;
}

/**
 * Convert atmn PlanItem to ProductItem-like shape for display
 */
export const planFeatureToItem = ({
	planFeature,
}: {
	planFeature: PlanItem;
}): ProductItemLike => {
	// Support both 'included' and legacy 'granted' field names
	const pi = planFeature as PlanItem & { granted?: number };
	const includedValue = planFeature.included ?? pi.granted;

	// Determine interval: reset.interval > price.interval
	const interval = planFeature.reset?.interval ?? planFeature.price?.interval ?? null;
	const priceWithInterval = planFeature.price as { intervalCount?: number } | undefined;
	const intervalCount = planFeature.reset?.intervalCount ?? priceWithInterval?.intervalCount ?? null;

	return {
		feature_id: planFeature.featureId,
		included_usage: planFeature.unlimited ? "inf" : (includedValue ?? null),
		interval,
		interval_count: intervalCount,
		price: planFeature.price?.amount ?? null,
		tiers: planFeature.price?.tiers ?? null,
		billing_units: (planFeature.price as { billingUnits?: number } | undefined)?.billingUnits ?? null,
	};
};

/**
 * Minimal Feature shape needed for display functions
 */
export interface FeatureLike {
	id: string;
	name: string;
	type: string;
	display?: { singular?: string; plural?: string } | null;
}

/**
 * Convert atmn Feature to FeatureLike shape for display
 */
export const featureToDisplayFeature = ({
	feature,
}: {
	feature: Feature;
}): FeatureLike => {
	return {
		id: feature.id,
		name: feature.name,
		type: feature.type,
		display: null, // atmn features don't have display config yet
	};
};
