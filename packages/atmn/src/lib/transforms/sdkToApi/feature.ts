import { mapRecordValues } from "@autumn/shared";
import type {
	CreditDimension,
	CreditMultiplier,
	CreditSchemaItem,
	Feature,
} from "../../../compose/models/index.js";
import type { ApiFeature } from "../../api/types/feature.js";

type ApiCreditSchemaItem = NonNullable<ApiFeature["credit_schema"]>[number];
type ApiCreditDimension = NonNullable<
	ApiCreditSchemaItem["dimensions"]
>[string];

const matchToApi = (
	match: CreditDimension["match"],
): ApiCreditDimension["match"] =>
	Object.fromEntries(
		Object.entries(match).map(([key, value]) => [key, String(value)]),
	);

function creditDimensionToApi(dimension: CreditDimension): ApiCreditDimension {
	const base = {
		match: matchToApi(dimension.match),
		...(dimension.priority !== undefined && { priority: dimension.priority }),
	};

	if (dimension.tierBehavior === "graduated") {
		return {
			...base,
			tier_behavior: "graduated" as const,
			tiers: dimension.tiers.map((tier) => ({
				to: tier.to,
				credit_cost: tier.creditCost,
			})),
		};
	}

	return { ...base, credit_cost: dimension.creditCost };
}

function creditMultiplierToApi(
	multiplier: CreditMultiplier,
): NonNullable<ApiCreditSchemaItem["multipliers"]>[string] {
	return { ...multiplier, match: matchToApi(multiplier.match) };
}

function creditDimensionRulesToApi(
	creditSchemaItem: Pick<CreditSchemaItem, "dimensions" | "multipliers">,
) {
	return {
		...(creditSchemaItem.dimensions !== undefined && {
			dimensions: mapRecordValues({
				record: creditSchemaItem.dimensions,
				mapValue: creditDimensionToApi,
			}),
		}),
		...(creditSchemaItem.multipliers !== undefined && {
			multipliers: mapRecordValues({
				record: creditSchemaItem.multipliers,
				mapValue: creditMultiplierToApi,
			}),
		}),
	};
}

export interface ApiFeatureParams {
	id: string;
	name: string;
	type: string;
	consumable?: boolean;
	archived?: boolean;
	event_names?: string[];
	credit_schema?: ApiFeature["credit_schema"];
	model_markups?: Record<
		string,
		{
			markup?: number;
			input_cost?: number;
			output_cost?: number;
		}
	>;
	default_markup?: number;
	provider_markups?: Record<string, { markup: number }>;
}

export function transformFeatureToApi(feature: Feature): ApiFeatureParams {
	const base: ApiFeatureParams = {
		id: feature.id,
		name: feature.name,
		type: feature.type,
	};

	if (feature.archived !== undefined) {
		base.archived = feature.archived;
	}

	if (feature.eventNames !== undefined) {
		base.event_names = feature.eventNames;
	}

	if (feature.type === "metered") {
		base.consumable = feature.consumable;
	}

	if (feature.type === "credit_system" && feature.creditSchema) {
		base.credit_schema = feature.creditSchema.map((creditSchemaItem) => {
			const baseItem = {
				metered_feature_id: creditSchemaItem.meteredFeatureId,
				...(creditSchemaItem.billingUnits !== undefined && {
					billing_units: creditSchemaItem.billingUnits,
				}),
				...creditDimensionRulesToApi(creditSchemaItem),
			};

			if (creditSchemaItem.tierBehavior === "graduated") {
				return {
					...baseItem,
					tier_behavior: "graduated" as const,
					tiers: creditSchemaItem.tiers.map((tier) => ({
						to: tier.to,
						credit_cost: tier.creditCost,
					})),
				};
			}

			return {
				...baseItem,
				credit_cost: creditSchemaItem.creditCost,
			};
		});
	}

	if (feature.type === "ai_credit_system") {
		if (feature.modelMarkups) {
			base.model_markups = Object.fromEntries(
				Object.entries(feature.modelMarkups).map(([modelId, entry]) => [
					modelId,
					{
						markup: entry.markup,
						input_cost: entry.inputCost,
						output_cost: entry.outputCost,
					},
				]),
			);
		}
		if (feature.defaultMarkup !== undefined) {
			base.default_markup = feature.defaultMarkup;
		}
		if (feature.providerMarkups) {
			base.provider_markups = feature.providerMarkups;
		}
	}

	return base;
}
