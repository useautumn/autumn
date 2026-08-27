import {
	type ApiCreditSchemaItem,
	type CreditSchemaItem,
	type Feature,
	type FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	type ModelMarkups,
	type ProviderMarkups,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";
import { creditSchemaToApi } from "../credit-systems/utils/creditSchemaUtils";
import {
	featureStripeProductChanged,
	normalizeFeatureStripeProductId,
} from "./featureStripeProductChanged";

interface BuildFeatureMarkupParamsArgs {
	type: FeatureType;
	modelMarkups?: ModelMarkups;
	defaultMarkup?: number | null;
	providerMarkups?: ProviderMarkups;
	schema?: CreditSchemaItem[];
	invoiceCredit?: boolean;
}

interface FeatureMarkupParams {
	model_markups?: ModelMarkups;
	default_markup?: number | null;
	provider_markups?: ProviderMarkups;
	credit_schema?: ApiCreditSchemaItem[];
	invoice_credit?: boolean;
}

/**
 * Centralizes the AI-vs-classic credit system field selection shared by the
 * feature mutation sheets. AI credit systems carry markup fields and omit the
 * rate card; classic credit systems do the inverse.
 */
export const buildFeatureMarkupParams = ({
	type,
	modelMarkups,
	defaultMarkup,
	providerMarkups,
	schema,
	invoiceCredit,
}: BuildFeatureMarkupParamsArgs): FeatureMarkupParams => {
	const ai = isAiCreditSystem(type);
	return {
		model_markups: ai ? modelMarkups : undefined,
		default_markup: ai ? defaultMarkup : undefined,
		provider_markups: ai ? providerMarkups : undefined,
		credit_schema: ai || !schema ? undefined : creditSchemaToApi(schema),
		invoice_credit: ai ? undefined : invoiceCredit,
	};
};

/** Maps a feature draft/row to a catalogV2 features[] entry (create or update). */
export const featureToCatalogFeatureParams = ({
	feature,
	featureId = feature.id,
	newFeatureId,
	archived,
	originalStripeProductId,
}: {
	feature: Pick<Feature, "id" | "name" | "type" | "config" | "event_names"> & {
		model_markups?: Feature["model_markups"];
		stripe_product_id?: string | null;
	};
	featureId?: string;
	newFeatureId?: string;
	archived?: boolean;
	originalStripeProductId?: string | null;
}): UpdateCatalogFeatureParams => {
	const renamed =
		newFeatureId !== undefined && newFeatureId !== featureId
			? newFeatureId
			: undefined;
	const nextProductId = normalizeFeatureStripeProductId(
		feature.stripe_product_id,
	);
	const processors = featureStripeProductChanged({
		from: originalStripeProductId,
		to: nextProductId,
	})
		? { stripe: { product_id: nextProductId ?? "" } }
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
			invoiceCredit: feature.config?.invoice_credit,
		}),
		...(archived !== undefined ? { archived } : {}),
		...(processors ? { processors } : {}),
	};
};
