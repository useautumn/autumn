import type { CreateFeature } from "@autumn/shared";

export const validateCreditSystem = (
	creditSystem: CreateFeature,
): string | null => {
	if (!creditSystem.id || !creditSystem.name) {
		return "Please fill in all fields";
	}

	const isAiCreditSystem = creditSystem.model_markups != null;

	if (isAiCreditSystem) {
		if (Object.keys(creditSystem.model_markups!).length === 0) {
			return "Add at least one model";
		}
		for (const [modelId] of Object.entries(creditSystem.model_markups!)) {
			if (!modelId) return "Select a model for each row";
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
