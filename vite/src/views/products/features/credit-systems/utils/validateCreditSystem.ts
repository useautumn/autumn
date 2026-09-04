import {
	type CreateFeature,
	type CreditSchemaItem,
	findAmbiguousCreditDimensions,
	formatCreditMatch,
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

const validateDimensionMatches = (item: CreditSchemaItem): string | null => {
	const rules = [
		...Object.values(item.dimensions ?? {}),
		...Object.values(item.multipliers ?? {}),
	];
	for (const rule of rules) {
		for (const [key, value] of Object.entries(rule.match)) {
			if (!key.trim()) return "Each dimension needs a property";
			if (!value.trim()) return `Each ${key} value needs a name`;
		}
	}
	const [ambiguous] = findAmbiguousCreditDimensions(item.dimensions ?? {});
	if (ambiguous) {
		return `Two rates both match ${formatCreditMatch(ambiguous.example)}. Add a value to one of them`;
	}
	for (const multiplier of Object.values(item.multipliers ?? {})) {
		const factor = Number(multiplier.factor);
		if (multiplier.factor !== undefined && !(factor > 0)) {
			return "Multiplier factors must be greater than 0";
		}
	}
	return null;
};

const validateSchemaItem = (item: CreditSchemaItem): string | null => {
	if (!item.metered_feature_id) {
		return "Select a feature on every rate card row";
	}

	const dimensionError = validateDimensionMatches(item);
	if (dimensionError) return dimensionError;

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
	// Identity is checked last: it lives at the top of the sheet, so reporting it
	// first hides a rate card problem the user is actually looking at.
	const missingIdentity = !creditSystem.name?.trim()
		? "Give this credit system a name"
		: !creditSystem.id?.trim()
			? "Give this credit system an ID"
			: null;

	if (isAiCreditSystem(creditSystem.type)) {
		// No per-model rows is valid: such systems bill at the base cost,
		// adjusted by any provider-level or global default markup.
		const modelMarkups: Record<
			string,
			{ input_cost?: number | null; output_cost?: number | null }
		> = creditSystem.model_markups ?? {};
		for (const [modelId, entry] of Object.entries(modelMarkups)) {
			if (!modelId) return "Select a model for each row";
			if (isCustomModel(modelId)) {
				const { modelKey } = splitModelId(modelId);
				if (!modelKey) return "Custom model ID cannot be empty";
				if (entry.input_cost == null || entry.output_cost == null)
					return "Custom models require input and output costs";
			}
		}
		return missingIdentity;
	}

	if (!creditSystem.config?.schema || creditSystem.config.schema.length === 0) {
		return "Add at least one feature to the rate card";
	}

	for (const item of creditSystem.config.schema) {
		const error = validateSchemaItem(item);
		if (error) return error;
	}

	if (missingIdentity) return missingIdentity;

	return null;
};
