import {
	type CreditSchemaItem,
	type Feature,
	type FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	type ModelMarkups,
	type ProviderMarkups,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";

interface BuildFeatureMarkupParamsArgs {
	type: FeatureType;
	modelMarkups?: ModelMarkups;
	defaultMarkup?: number | null;
	providerMarkups?: ProviderMarkups;
	schema?: CreditSchemaItem[];
}

interface FeatureMarkupParams {
	model_markups?: ModelMarkups;
	default_markup?: number | null;
	provider_markups?: ProviderMarkups;
	credit_schema?: { metered_feature_id: string; credit_cost: number }[];
}

/**
 * Centralizes the AI-vs-classic credit system field selection shared by the
 * feature mutation sheets. AI credit systems carry markup fields and omit the
 * credit schema; classic credit systems do the inverse.
 */
export const buildFeatureMarkupParams = ({
	type,
	modelMarkups,
	defaultMarkup,
	providerMarkups,
	schema,
}: BuildFeatureMarkupParamsArgs): FeatureMarkupParams => {
	const ai = isAiCreditSystem(type);
	return {
		model_markups: ai ? modelMarkups : undefined,
		default_markup: ai ? defaultMarkup : undefined,
		provider_markups: ai ? providerMarkups : undefined,
		credit_schema: ai
			? undefined
			: schema?.map((item) => ({
					metered_feature_id: item.metered_feature_id,
					credit_cost:
						item.credit_amount != null ? Number(item.credit_amount) : 0,
				})),
	};
};

/** Maps a feature draft/row to a catalogV2 features[] entry (create or update). */
export const featureToCatalogFeatureParams = ({
	feature,
	featureId = feature.id,
	newFeatureId,
	archived,
}: {
	feature: Pick<Feature, "id" | "name" | "type" | "config" | "event_names"> & {
		model_markups?: Feature["model_markups"];
	};
	featureId?: string;
	newFeatureId?: string;
	archived?: boolean;
}): UpdateCatalogFeatureParams => {
	const renamed =
		newFeatureId !== undefined && newFeatureId !== featureId
			? newFeatureId
			: undefined;

	return {
		feature_id: featureId,
		...(renamed ? { new_feature_id: renamed } : {}),
		name: feature.name,
		type: feature.type,
		consumable: feature.config?.usage_type === FeatureUsageType.Single,
		event_names: feature.event_names,
		...buildFeatureMarkupParams({
			type: feature.type,
			modelMarkups: feature.model_markups ?? undefined,
			defaultMarkup: feature.config?.default_markup,
			providerMarkups: feature.config?.provider_markups,
			schema: feature.config?.schema,
		}),
		...(archived !== undefined ? { archived } : {}),
	};
};
