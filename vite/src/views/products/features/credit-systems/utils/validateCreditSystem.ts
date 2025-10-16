import type { CreateFeature } from "@autumn/shared";

export const validateCreditSystem = (
	creditSystem: CreateFeature,
): string | null => {
	if (!creditSystem.id || !creditSystem.name) {
		return "Please fill in all fields";
	}

	if (creditSystem.config.schema.length === 0) {
		return "Need at least one metered feature";
	}

	for (const item of creditSystem.config.schema) {
		if (!item.metered_feature_id) {
			return "Select a metered feature";
		}

		if (item.feature_amount <= 0 || item.credit_amount <= 0) {
			return "Credit amount must be greater than 0";
		}
	}

	return null;
};
