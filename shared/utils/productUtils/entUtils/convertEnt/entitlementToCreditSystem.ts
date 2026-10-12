import {
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	isExcludedCreditSchemaItem,
	type ModelMarkups,
} from "../../../../models/featureModels/featureConfig/creditConfig.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import type { EntitlementWithFeature } from "../../../../models/productModels/entModels/entModels.js";
import { isAnyCreditSystem } from "../../../featureUtils/classifyFeature/isAnyCreditSystem.js";

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
		// Cost basis last: a plan sets markup, never what the model itself costs.
		merged[modelId] = { ...override?.[modelId], ...costBasis };
	}
	return merged;
};

/** Override rows patch the catalog schema by feature: a rate row replaces or
 * adds that feature, an excluded row removes it, unlisted features inherit. */
const mergeCreditSchema = ({
	catalog,
	override,
}: {
	catalog: CreditSchemaItem[];
	override: CreditSchemaOverrideItem[];
}): CreditSchemaItem[] => {
	const merged = new Map(catalog.map((row) => [row.metered_feature_id, row]));
	for (const row of override) {
		if (isExcludedCreditSchemaItem(row)) merged.delete(row.metered_feature_id);
		else merged.set(row.metered_feature_id, row);
	}
	return [...merged.values()];
};

/** The one place a plan item's feature_override is applied. */
export const entitlementToCreditSystem = ({
	entitlement,
}: {
	entitlement: Pick<EntitlementWithFeature, "feature" | "feature_override">;
}): Feature => {
	const creditSystem = entitlement.feature;
	const override = entitlement.feature_override;

	if (!(override && isAnyCreditSystem(creditSystem.type))) return creditSystem;

	const { markups, schema, ...configKeys } = override;
	const config = {
		...creditSystem.config,
		...configKeys,
		...(schema
			? {
					schema: mergeCreditSchema({
						catalog: creditSystem.config?.schema ?? [],
						override: schema,
					}),
				}
			: {}),
	};

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
