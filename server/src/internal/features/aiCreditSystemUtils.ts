import {
	ErrCode,
	type Feature,
	InternalError,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing.js";

export type TokenInput = { input: number; output: number };

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

export const getModelCreditCost = async ({
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
	const { markup } = markupEntry ?? { markup: 0 };

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
