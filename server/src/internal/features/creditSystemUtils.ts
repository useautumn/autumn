import {
	type CreditSchemaItem,
	ErrCode,
	type Feature,
	FeatureType,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing";

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
const getModelCreditCost = async ({
	modelName,
	creditSystem,
	input,
	output,
}: {
	modelName: string;
	creditSystem: Feature;
	input: number;
	output: number;
}) => {
	const markups = creditSystem.model_markups || {};

	// Try exact match first (new "providerKey/modelKey" format)
	const markupEntry = markups[modelName];
	const { markup } = markupEntry ?? { markup: 0 };

	if (modelName.startsWith("custom/")) {
		if (!markupEntry?.input_cost || !markupEntry?.output_cost) {
			throw new RecaseError({
				message: `Custom model ${modelName} is missing input_cost or output_cost in model_markups`,
				code: ErrCode.InvalidRequest,
				data: { modelName },
			});
		}
		const actualInputCost = new Decimal(markupEntry.input_cost);
		const actualOutputCost = new Decimal(markupEntry.output_cost);
		const totalCost = actualInputCost
			.mul(input)
			.add(actualOutputCost.mul(output))
			.div(1_000_000);
		const markedUpCost = totalCost.mul(new Decimal(1).add(markup / 100));
		return markedUpCost.toNumber();
	}

	const pricingData = await getModelsDevPricing();
	if (!pricingData) {
		throw new RecaseError({
			message: "Failed to fetch models.dev pricing data",
			code: ErrCode.FeatureNotFound,
		});
	}

	// Try to find model by parsing "providerKey/modelKey" format
	const [providerKey, ...modelParts] = modelName.split("/");
	const modelKey = modelParts.join("/");
	const model = pricingData[providerKey]?.models[modelKey];

	if (!model) {
		throw new RecaseError({
			message: `Model ${modelName} not found in models.dev pricing data ${providerKey} provider config.`,
			code: ErrCode.FeatureNotFound,
			data: { modelName },
		});
	}

	// model.cost.input / model.cost.output are in $/M tokens
	const actualInputCost = new Decimal(model.cost.input);
	const actualOutputCost = new Decimal(model.cost.output);
	const totalCost = actualInputCost
		.mul(input)
		.add(actualOutputCost.mul(output))
		.div(1_000_000);
	const markedUpCost = totalCost.mul(new Decimal(1).add(markup / 100));
	return markedUpCost.toNumber();
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
	tokens?: {
		input: number;
		output: number;
	};
}) => {
	if (creditSystem.type !== FeatureType.CreditSystem) {
		return amount;
	}
	if (creditSystem.is_ai_credit_system) {
		if (!tokens || !modelName) {
			throw new RecaseError({
				message: "modelName and tokens must be provided for AI credit systems",
				code: ErrCode.InvalidRequest,
			});
		}
		const modelPricing = await getModelCreditCost({
			modelName,
			creditSystem,
			...tokens,
		});
		return modelPricing;
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

	return 1;
};
