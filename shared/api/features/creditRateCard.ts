import { z } from "zod/v4";
import {
	CreditDimensionNameSchema,
	CreditMatchSchema,
} from "../../models/featureModels/featureConfig/creditConfig.js";
import { findCreditTierViolations } from "../../utils/featureUtils/creditDimensions/creditTierRules.js";

export const ApiCreditTierSchema = z.object({
	to: z.union([z.number().positive(), z.enum(["inf"])]).meta({
		description:
			"Inclusive upper usage boundary for this graduated tier. The final tier must be 'inf'.",
	}),
	credit_cost: z.number().min(0).meta({
		description: "Credits consumed per billing-unit group within this tier.",
	}),
});

const refineGraduatedTiers = (
	item: { tiers: z.infer<typeof ApiCreditTierSchema>[] },
	ctx: z.RefinementCtx,
) => {
	const violations = findCreditTierViolations(
		item.tiers.map((tier) => tier.to),
	);
	for (const { index, message } of violations) {
		ctx.addIssue({
			code: "custom",
			message,
			path: ["tiers", index, "to"],
		});
	}
};

const ApiCreditMatchSchema = CreditMatchSchema.meta({
	description:
		"Event properties this entry applies to. Every key must equal the tracked property, compared as strings.",
});

const ApiCreditDimensionBaseSchema = z.object({
	match: ApiCreditMatchSchema,
	priority: z.number().int().optional().meta({
		description:
			"Breaks ties between dimensions that match the same number of keys. Higher wins.",
	}),
});

export const ApiCreditDimensionSchema = z.union([
	ApiCreditDimensionBaseSchema.extend({
		tier_behavior: z.literal("graduated"),
		tiers: z.array(ApiCreditTierSchema).min(1),
	})
		.strict()
		.superRefine(refineGraduatedTiers),
	ApiCreditDimensionBaseSchema.extend({
		credit_cost: z.number().min(0).meta({
			description:
				"Credits consumed per billing-unit group when this dimension matches.",
		}),
	}).strict(),
]);

export const ApiCreditMultiplierSchema = z
	.object({
		match: ApiCreditMatchSchema,
		factor: z.number().positive().optional().meta({
			description:
				"Multiplies the matched rate. All matching multipliers stack.",
		}),
		add: z.number().optional().meta({
			description:
				"Added to the rate after every factor is applied, in credits per billing-unit group.",
		}),
	})
	.strict()
	.refine(
		(multiplier) =>
			multiplier.factor !== undefined || multiplier.add !== undefined,
		{ message: "A multiplier needs a factor or an add." },
	);

const ApiCreditSchemaItemBaseSchema = z.object({
	metered_feature_id: z.string().nonempty().meta({
		description:
			"ID of the metered feature that draws from this credit system.",
	}),
	billing_units: z.number().positive().optional().meta({
		description:
			"Number of metered-feature units priced together. Defaults to one when omitted.",
	}),
	dimensions: z
		.record(CreditDimensionNameSchema, ApiCreditDimensionSchema)
		.optional()
		.meta({
			description:
				"Named rates chosen by event properties. The most specific match sets the rate; with no match the item's own rate applies.",
		}),
	multipliers: z
		.record(CreditDimensionNameSchema, ApiCreditMultiplierSchema)
		.optional()
		.meta({
			description:
				"Named adjustments chosen by event properties. Every match applies: factors multiply, then adds are summed.",
		}),
});

export const ApiFlatCreditSchemaItemSchema =
	ApiCreditSchemaItemBaseSchema.extend({
		credit_cost: z.number().min(0).meta({
			description: "Credits consumed per billing-unit group.",
		}),
	}).strict();

export const ApiGraduatedCreditSchemaItemSchema =
	ApiCreditSchemaItemBaseSchema.extend({
		tier_behavior: z.literal("graduated"),
		tiers: z.array(ApiCreditTierSchema).min(1),
	})
		.strict()
		.superRefine(refineGraduatedTiers);

export const ApiCreditSchemaItemSchema = z.union([
	ApiGraduatedCreditSchemaItemSchema,
	ApiFlatCreditSchemaItemSchema,
]);

const ApiLegacyFlatCreditSchemaItemSchema =
	ApiFlatCreditSchemaItemSchema.extend({
		metered_feature_id: z.literal(""),
	}).strict();

export const ApiCreditSchemaResponseItemSchema = z.union([
	ApiGraduatedCreditSchemaItemSchema,
	ApiFlatCreditSchemaItemSchema,
	ApiLegacyFlatCreditSchemaItemSchema,
]);

export type ApiCreditSchemaItem = z.infer<typeof ApiCreditSchemaItemSchema>;
export type ApiCreditSchemaResponseItem = z.infer<
	typeof ApiCreditSchemaResponseItemSchema
>;

export const isGraduatedCreditSchemaItem = (
	item: ApiCreditSchemaItem | ApiCreditSchemaResponseItem,
): item is Extract<
	ApiCreditSchemaItem | ApiCreditSchemaResponseItem,
	{ tier_behavior: "graduated" }
> => "tier_behavior" in item && item.tier_behavior === "graduated";

export type ApiCreditDimension = z.infer<typeof ApiCreditDimensionSchema>;
export type ApiCreditMultiplier = z.infer<typeof ApiCreditMultiplierSchema>;
