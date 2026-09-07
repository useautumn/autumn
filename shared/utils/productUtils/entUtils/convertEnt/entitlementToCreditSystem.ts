import type { ModelMarkups } from "../../../../models/featureModels/featureConfig/creditConfig.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import type { EntitlementWithFeature } from "../../../../models/productModels/entModels/entModels.js";
import { isAnyCreditSystem } from "../../../featureUtils/classifyFeature/isAnyCreditSystem.js";

/** A custom model's input_cost/output_cost define the model, so the catalog
 * keeps supplying them; only the markup is per-plan. */
const mergeModelMarkups = ({
	catalog,
	override,
}: {
	catalog: ModelMarkups;
	override: ModelMarkups;
}): ModelMarkups => {
	if (!catalog) return override ?? null;

	const merged: NonNullable<ModelMarkups> = { ...override };
	for (const [modelId, { markup: _perPlan, ...costBasis }] of Object.entries(
		catalog,
	)) {
		merged[modelId] = { ...costBasis, ...override?.[modelId] };
	}
	return merged;
};

/**
 * The effective credit system for an entitlement — the one place a plan item's
 * feature_override is applied, so everything downstream keeps consuming a plain
 * Feature. An override replaces what it covers: an unset markup level means no
 * markup, not the feature's.
 */
export const entitlementToCreditSystem = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}): Feature => {
	const creditSystem = entitlement.feature;
	const override = entitlement.feature_override;

	if (!(override && isAnyCreditSystem(creditSystem.type))) return creditSystem;

	const { markups, ...configKeys } = override;
	const config = { ...creditSystem.config, ...configKeys };

	if (!markups) return { ...creditSystem, config };

	return {
		...creditSystem,
		// model_markups is a column; its two siblings live in config.
		model_markups: mergeModelMarkups({
			catalog: creditSystem.model_markups,
			override: markups.model_markups,
		}),
		config: {
			...config,
			default_markup: markups.default_markup,
			provider_markups: markups.provider_markups ?? null,
		},
	};
};
