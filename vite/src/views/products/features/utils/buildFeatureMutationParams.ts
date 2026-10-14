import {
	type ApiCreditSchemaItem,
	type CreditSchemaItem,
	type Feature,
	type FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	isAnyCreditSystem,
	type ModelMarkups,
	type ProviderMarkups,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";
import { creditSchemaToApi } from "../credit-systems/utils/creditSchemaUtils";

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
	credit_schema?: ApiCreditSchemaItem[];
}

export const buildFeatureMarkupParams = ({
	type,
	modelMarkups,
	defaultMarkup,
	providerMarkups,
	schema,
}: BuildFeatureMarkupParamsArgs): FeatureMarkupParams => {
	const ai = isAiCreditSystem(type);
	const classicCreditSystem = isAnyCreditSystem(type) && !ai;
	return {
		model_markups: ai ? modelMarkups : undefined,
		default_markup: ai ? defaultMarkup : undefined,
		provider_markups: ai ? providerMarkups : undefined,
		credit_schema:
			classicCreditSystem && schema ? creditSchemaToApi(schema) : undefined,
	};
};

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
