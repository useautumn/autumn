import type { CreateFeature } from "@autumn/shared";

export const validateCreditSystem = (
	creditSystem: CreateFeature,
): string | null => {
	if (!creditSystem.id || !creditSystem.name) {
		return "Please fill in all fields";
	}

	const isAiCreditSystem = creditSystem.is_ai_credit_system ?? false;

	if (isAiCreditSystem) {
		if (!creditSystem.model_markups || Object.keys(creditSystem.model_markups).length === 0)
			return "Add at least one model markup";

		for (const [modelId, entry] of Object.entries(creditSystem.model_markups)) {
			if (!modelId) return "Select a model for each row";
			if (modelId.startsWith("custom/")) {
				const customModelKey = modelId.slice("custom/".length);
				if (!customModelKey) return "Custom model ID cannot be empty";
				if (entry.input_cost == null || entry.output_cost == null)
					return "Custom models require input and output costs";
			}
		}
		return null;
	}

	if (!creditSystem.config?.schema || creditSystem.config.schema.length === 0) {
		return "Need at least one item in the schema";
	}

	for (const item of creditSystem.config.schema) {
		if (!item.metered_feature_id) {
			return "Select a feature for each row";
		}
		if ((item.credit_amount ?? 0) <= 0) {
			return "Credit amount must be greater than 0";
		}
	}

	return null;
};
