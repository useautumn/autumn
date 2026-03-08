import {
	type CreditSchemaItem,
	ErrCode,
	type Feature,
	FeatureType,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	getOpenrouterPricing,
	normaliseAiModelName,
} from "@/internal/features/utils/getOpenrouterPricing";

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
	const models = await getOpenrouterPricing();
	const markups = creditSystem.model_markups || {};
	const { markup } = markups[modelName] || { markup: 0 };
	const model = models.find(
		(m) => normaliseAiModelName(m.id) === normaliseAiModelName(modelName),
	);
	if (!model) {
		throw new RecaseError({
			message: `Model ${modelName} not found in OpenRouter pricing data`,
			code: ErrCode.FeatureNotFound,
			data: {
				modelName,
				normalisedModelName: normaliseAiModelName(modelName),
			},
		});
	}
	const actualInputCost = new Decimal(model.pricing.prompt);
	const actualOutputCost = new Decimal(model.pricing.completion);
	const totalCost = actualInputCost.mul(input).add(actualOutputCost.mul(output));
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
