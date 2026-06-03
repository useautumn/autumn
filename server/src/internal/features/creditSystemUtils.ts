import {
	type CreditSchemaItem,
	ErrCode,
	type Feature,
	FeatureType,
	InternalError,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing.js";

type TokenInput = { input: number; output: number };

const creditSystemContainsFeature = ({
	creditSystem,
	meteredFeatureId,
}: {
	creditSystem: Feature;
	meteredFeatureId: string;
}) => {
	if (creditSystem.type !== FeatureType.CreditSystem) {
		return false;
	}
	const schema: CreditSchemaItem[] | undefined = creditSystem.config?.schema;
	if (!schema) return false;

	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === meteredFeatureId) {
			return true;
		}
	}

	return false;
};

export const getCreditSystemsFromFeature = ({
	featureId,
	features,
}: {
	featureId: string;
	features: Feature[];
}) => {
	return features.filter(
		(f) =>
			f.type === FeatureType.CreditSystem &&
			f.id !== featureId &&
			creditSystemContainsFeature({
				creditSystem: f,
				meteredFeatureId: featureId,
			}),
	);
};

export const featureToCreditSystem = ({
	featureId,
	creditSystem,
	amount,
}: {
	featureId: string;
	creditSystem: Feature;
	amount: number;
}) => {
	const schema: CreditSchemaItem[] = creditSystem.config.schema;

	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === featureId) {
			const creditAmount = schemaItem.credit_amount;
			const featureAmount = schemaItem.feature_amount ?? 1;

			return new Decimal(creditAmount)
				.div(featureAmount)
				.mul(amount)
				.toNumber();
		}
	}

	return amount;
};
// Costs are in $/M tokens; markup is a percentage (e.g. 20 = +20%).
const computeMarkedUpCost = ({
	inputCostPerMillion,
	outputCostPerMillion,
	input,
	output,
	markup,
}: {
	inputCostPerMillion: Decimal.Value;
	outputCostPerMillion: Decimal.Value;
	input: number;
	output: number;
	markup: number;
}) =>
	new Decimal(inputCostPerMillion)
		.mul(input)
		.add(new Decimal(outputCostPerMillion).mul(output))
		.div(1_000_000)
		.mul(new Decimal(1).add(new Decimal(markup).div(100)))
		.toNumber();

const resolveAiMarkup = ({
	modelName,
	creditSystem,
	modelMarkup,
}: {
	modelName: string;
	creditSystem: Feature;
	modelMarkup?: { markup?: number | null } | null;
}) => {
	if (modelMarkup?.markup != null) {
		return modelMarkup.markup;
	}

	const [providerKey] = modelName.split("/");
	const providerMarkup =
		creditSystem.config?.provider_markups?.[providerKey]?.markup;
	if (providerMarkup != null) {
		return providerMarkup;
	}

	return creditSystem.config?.default_markup ?? 0;
};

const getModelCreditCost = async ({
	modelName,
	creditSystem,
	input,
	output,
}: {
	modelName: string;
	creditSystem: Feature;
} & TokenInput) => {
	const markups = creditSystem.model_markups || {};
	const markupEntry = markups[modelName];
	const markup = resolveAiMarkup({
		modelName,
		creditSystem,
		modelMarkup: markupEntry,
	});

	if (modelName.startsWith("custom/")) {
		if (markupEntry?.input_cost == null || markupEntry?.output_cost == null) {
			throw new RecaseError({
				message: `Custom model ${modelName} is missing input_cost or output_cost in model_markups`,
				code: ErrCode.InvalidRequest,
				data: { modelName },
			});
		}
		return computeMarkedUpCost({
			inputCostPerMillion: markupEntry.input_cost,
			outputCostPerMillion: markupEntry.output_cost,
			input,
			output,
			markup,
		});
	}

	const pricingData = await getModelsDevPricing();
	if (!pricingData) {
		throw new InternalError({
			message: "Failed to fetch models.dev pricing data",
			code: ErrCode.InternalError,
		});
	}

	const [providerKey, ...modelParts] = modelName.split("/");
	const modelKey = modelParts.join("/");
	const model = pricingData[providerKey]?.models[modelKey];

	if (!model) {
		throw new RecaseError({
			message: `Model ${modelName} not found in models.dev pricing data ${providerKey} provider config.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			data: { modelName },
		});
	}

	return computeMarkedUpCost({
		inputCostPerMillion: model.cost.input,
		outputCostPerMillion: model.cost.output,
		input,
		output,
		markup,
	});
};

export const getCreditCost = async ({
	featureId,
	creditSystem,
	amount = 1,
	tokens,
	modelName,
}: {
	featureId: string;
	creditSystem: Feature;
	amount?: number;
	modelName?: string;
	tokens?: TokenInput;
}) => {
	if (
		creditSystem.type !== FeatureType.CreditSystem &&
		creditSystem.type !== FeatureType.AiCreditSystem
	) {
		return amount;
	}
	if (creditSystem.type === FeatureType.AiCreditSystem) {
		if (!tokens || !modelName) {
			throw new RecaseError({
				message: "modelName and tokens must be provided for AI credit systems",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return await getModelCreditCost({
			modelName,
			creditSystem,
			...tokens,
		});
	}
	// If tracking the credit system feature itself, 1:1 mapping
	if (featureId === creditSystem.id) {
		return amount;
	}
	const schema: CreditSchemaItem[] = creditSystem.config.schema;
	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === featureId) {
			return new Decimal(schemaItem.credit_amount)
				.div(schemaItem.feature_amount ?? 1)
				.mul(amount)
				.toNumber();
		}
	}

	throw new RecaseError({
		message: "Feature is not included in credit system schema",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: { featureId, creditSystemId: creditSystem.id },
	});
};
