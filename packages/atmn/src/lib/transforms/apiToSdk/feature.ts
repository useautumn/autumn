import { mapRecordValues } from "@autumn/shared";
import type {
	CreditDimension,
	CreditSchemaItem,
	Feature,
	ModelMarkupEntry,
} from "../../../compose/models/featureModels.js";
import type { ApiFeature } from "../../api/types/feature.js";
import { createTransformer } from "./Transformer.js";

type RawApiFeature = Omit<ApiFeature, "type"> & { type: string };

type ApiCreditSchemaItem = NonNullable<RawApiFeature["credit_schema"]>[number];
type ApiCreditDimension = NonNullable<
	ApiCreditSchemaItem["dimensions"]
>[string];
type ApiCreditRate =
	| {
			tier_behavior: "graduated";
			tiers: { to: number | "inf"; credit_cost: number }[];
	  }
	| { credit_cost: number };

/** The flat-or-graduated part of a rate, API → SDK naming. Rows and dimensions share it. */
function mapCreditRate(rate: ApiCreditRate) {
	if ("tier_behavior" in rate) {
		return {
			tierBehavior: "graduated" as const,
			tiers: rate.tiers.map((tier) => ({
				to: tier.to,
				creditCost: tier.credit_cost,
			})),
		};
	}
	return { creditCost: rate.credit_cost };
}

function mapCreditDimension(dimension: ApiCreditDimension): CreditDimension {
	return {
		match: dimension.match,
		...(dimension.priority !== undefined && { priority: dimension.priority }),
		...mapCreditRate(dimension),
	};
}

function mapCreditDimensionRules(creditSchemaItem: ApiCreditSchemaItem) {
	return {
		...(creditSchemaItem.dimensions !== undefined && {
			dimensions: mapRecordValues({
				record: creditSchemaItem.dimensions,
				mapValue: mapCreditDimension,
			}),
		}),
		...(creditSchemaItem.multipliers !== undefined && {
			multipliers: creditSchemaItem.multipliers,
		}),
	};
}

function mapCreditSchema(api: RawApiFeature): CreditSchemaItem[] {
	return (api.credit_schema ?? []).map((creditSchemaItem) => ({
		meteredFeatureId: creditSchemaItem.metered_feature_id,
		...(creditSchemaItem.billing_units !== undefined && {
			billingUnits: creditSchemaItem.billing_units,
		}),
		...mapCreditDimensionRules(creditSchemaItem),
		...mapCreditRate(creditSchemaItem),
	}));
}

function mapModelMarkups(
	api: RawApiFeature,
): Record<string, ModelMarkupEntry> | undefined {
	if (!api.model_markups) return undefined;
	return Object.fromEntries(
		Object.entries(api.model_markups).map(([modelId, entry]) => [
			modelId,
			{
				markup: entry.markup,
				inputCost: entry.input_cost,
				outputCost: entry.output_cost,
			},
		]),
	);
}

const BASE_COMPUTE = {
	eventNames: (api: RawApiFeature) =>
		api.event_names && api.event_names.length > 0 ? api.event_names : undefined,
};

export const featureTransformer = createTransformer<RawApiFeature, Feature>({
	discriminator: "type",
	cases: {
		// Boolean features: just copy base fields, no consumable
		boolean: {
			copy: ["id", "name", "archived"],
			compute: {
				...BASE_COMPUTE,
				type: () => "boolean" as const,
			},
		},

		credit_system: {
			copy: ["id", "name", "archived"],
			compute: {
				...BASE_COMPUTE,
				type: () => "credit_system" as const,
				consumable: () => true,
				creditSchema: (api) => mapCreditSchema(api),
			},
		},

		ai_credit_system: {
			copy: ["id", "name", "archived"],
			compute: {
				...BASE_COMPUTE,
				type: () => "ai_credit_system" as const,
				modelMarkups: (api) => mapModelMarkups(api),
				defaultMarkup: (api) => api.default_markup ?? undefined,
				providerMarkups: (api) => api.provider_markups ?? undefined,
			},
		},

		// Backend bug: API returns "single_use" instead of "metered" with consumable=true
		single_use: {
			copy: ["id", "name", "archived"],
			compute: {
				...BASE_COMPUTE,
				type: () => "metered" as const,
				consumable: () => true,
			},
		},

		// Backend bug: API returns "continuous_use" instead of "metered" with consumable=false
		continuous_use: {
			copy: ["id", "name", "archived"],
			compute: {
				...BASE_COMPUTE,
				type: () => "metered" as const,
				consumable: () => false,
			},
		},

		// If API ever returns "metered" properly
		metered: {
			copy: ["id", "name", "archived"],
			compute: {
				...BASE_COMPUTE,
				type: () => "metered" as const,
				consumable: (api) => api.consumable ?? true,
			},
		},
	},

	// Fallback for unknown types
	default: {
		copy: ["id", "name", "archived"],
		compute: {
			...BASE_COMPUTE,
			type: () => "metered" as const,
			consumable: () => true,
		},
	},
});

export function transformApiFeature(apiFeature: RawApiFeature): Feature {
	return featureTransformer.transform(apiFeature);
}
