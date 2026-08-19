import {
	type CreateFeature,
	type CreditSchemaItem,
	Infinite,
	isAiCreditSystem,
	isCustomModel,
	splitModelId,
} from "@autumn/shared";
import { isGraduated } from "./creditSchemaUtils";

const isNonNegative = (value: unknown) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0;
};

const validateSchemaItem = (item: CreditSchemaItem): string | null => {
	if (!item.metered_feature_id) {
		return "Select a feature for each row";
	}

	const billingUnits = Number(item.feature_amount ?? 1);
	if (!Number.isFinite(billingUnits) || billingUnits <= 0) {
		return "Pricing units must be greater than 0";
	}

	if (!isGraduated(item)) {
		if (item.tier_behavior !== undefined || item.tiers !== undefined) {
			return "Flat rates cannot include tiers";
		}

		return isNonNegative(item.credit_amount)
			? null
			: "Credit cost cannot be negative";
	}

	if (item.credit_amount !== undefined) {
		return "Tiered rates cannot include a flat credit cost";
	}

	if (item.tiers.length === 0) {
		return "Add at least one tier";
	}

	let previousBoundary = 0;
	for (const [index, tier] of item.tiers.entries()) {
		if (!isNonNegative(tier.credit_amount)) {
			return "Credit cost cannot be negative";
		}

		if (index === item.tiers.length - 1) {
			if (tier.to !== Infinite) return "The last tier must be unbounded";
			continue;
		}

		if (tier.to === Infinite) {
			return "Only the last tier can be unbounded";
		}

		const boundary = Number(tier.to);
		if (!Number.isFinite(boundary) || boundary <= previousBoundary) {
			return "Tier limits must increase";
		}
		previousBoundary = boundary;
	}

	return null;
};

export const validateCreditSystem = (
	creditSystem: CreateFeature,
): string | null => {
	if (!creditSystem.id || !creditSystem.name) {
		return "Please fill in all fields";
	}

	if (isAiCreditSystem(creditSystem.type)) {
		// No per-model rows is valid: such systems bill at the base cost,
		// adjusted by any provider-level or global default markup.
		for (const [modelId, entry] of Object.entries(
			creditSystem.model_markups ?? {},
		)) {
			if (!modelId) return "Select a model for each row";
			if (isCustomModel(modelId)) {
				const { modelKey } = splitModelId(modelId);
				if (!modelKey) return "Custom model ID cannot be empty";
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
		const error = validateSchemaItem(item);
		if (error) return error;
	}

	return null;
};
