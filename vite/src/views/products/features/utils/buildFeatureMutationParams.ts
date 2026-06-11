import {
	type CreditSchemaItem,
	type FeatureType,
	isAiCreditSystem,
	type ModelMarkups,
	type ProviderMarkups,
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
