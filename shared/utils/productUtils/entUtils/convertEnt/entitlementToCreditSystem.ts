import type { ModelMarkups } from "../../../../models/featureModels/featureConfig/creditConfig.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import type { EntitlementWithFeature } from "../../../../models/productModels/entModels/entModels.js";
import { isAnyCreditSystem } from "../../../featureUtils/classifyFeature/isAnyCreditSystem.js";

/**
 * model_markups holds two different kinds of thing: a markup percentage, which
 * a plan may override, and a custom model's input_cost/output_cost, which are
 * the model's definition and have no meaning per-plan. So the override sets
 * markups while the catalog keeps supplying the cost basis — dropping it would
 * leave a custom model with no rates to price against at all.
 */
const overrideModelMarkups = ({
	catalog,
	override,
}: {
	catalog: ModelMarkups;
	override: ModelMarkups;
}): ModelMarkups => {
	if (!catalog) return override ?? null;

	const merged: NonNullable<ModelMarkups> = {};
	for (const [modelId, catalogEntry] of Object.entries(catalog)) {
		const { markup: _dropped, ...costBasis } = catalogEntry;
		merged[modelId] = { ...costBasis, ...override?.[modelId] };
	}
	for (const [modelId, overrideEntry] of Object.entries(override ?? {})) {
		if (!merged[modelId]) merged[modelId] = overrideEntry;
	}
	return merged;
};

/**
 * The effective credit system for an entitlement — the single place a plan
 * item's feature_override is applied. Everything downstream keeps consuming a
 * plain Feature, so rate and markup math is override-aware with no parallel
 * code path.
 *
 * `schema` spreads over config because it is keyed like the config itself.
 * `markups` cannot: model_markups is a top-level column while its two
 * siblings live in config, so the unit is unpacked across both.
 */
export const entitlementToCreditSystem = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}): Feature => {
	const creditSystem = entitlement.feature;
	const override = entitlement.feature_override;
	if (!(override && isAnyCreditSystem(creditSystem.type))) {
		return creditSystem;
	}

	const { markups, ...configOverride } = override;

	const effective: Feature = {
		...creditSystem,
		config: { ...creditSystem.config, ...configOverride },
	};

	if (!markups) return effective;

	// An override of the chain replaces every markup level, so an unset level
	// reads as "no markup here" rather than falling back to the catalog's.
	return {
		...effective,
		model_markups: overrideModelMarkups({
			catalog: creditSystem.model_markups,
			override: markups.model_markups,
		}),
		config: {
			...effective.config,
			default_markup: markups.default_markup,
			provider_markups: markups.provider_markups ?? null,
		},
	};
};
