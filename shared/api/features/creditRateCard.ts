import { z } from "zod/v4";

const ApiCreditSchemaItemBaseSchema = z.object({
	metered_feature_id: z.string().nonempty().meta({
		description:
			"ID of the metered feature that draws from this credit system.",
	}),
	billing_units: z.number().finite().positive().optional().meta({
		description:
			"Number of metered-feature units priced together. Defaults to one when omitted.",
	}),
});

export const ApiCreditTierSchema = z.object({
	to: z.union([z.number().finite().positive(), z.literal("inf")]).meta({
		description:
			"Inclusive upper usage boundary for this graduated tier. The final tier must be 'inf'.",
	}),
	credit_cost: z.number().finite().min(0).meta({
		description: "Credits consumed per billing-unit group within this tier.",
	}),
});

export const ApiFlatCreditSchemaItemSchema =
	ApiCreditSchemaItemBaseSchema.extend({
		credit_cost: z.number().finite().min(0).meta({
			description: "Credits consumed per billing-unit group.",
		}),
		tier_behavior: z.never().optional(),
		tiers: z.never().optional(),
	});

export const ApiGraduatedCreditSchemaItemSchema =
	ApiCreditSchemaItemBaseSchema.extend({
		credit_cost: z.never().optional(),
		tier_behavior: z.literal("graduated"),
		tiers: z.array(ApiCreditTierSchema).min(1),
	}).superRefine((item, ctx) => {
		let previousBoundary = 0;

		for (const [index, tier] of item.tiers.entries()) {
			const isLastTier = index === item.tiers.length - 1;

			if (tier.to === "inf") {
				if (!isLastTier) {
					ctx.addIssue({
						code: "custom",
						message: "Only the final tier may use an 'inf' boundary.",
						path: ["tiers", index, "to"],
					});
				}
				continue;
			}

			if (tier.to <= previousBoundary) {
				ctx.addIssue({
					code: "custom",
					message: "Tier boundaries must be strictly increasing.",
					path: ["tiers", index, "to"],
				});
			}
			previousBoundary = tier.to;

			if (isLastTier) {
				ctx.addIssue({
					code: "custom",
					message: "The final tier must use an 'inf' boundary.",
					path: ["tiers", index, "to"],
				});
			}
		}
	});

export const ApiCreditSchemaItemSchema = z.union([
	ApiFlatCreditSchemaItemSchema,
	ApiGraduatedCreditSchemaItemSchema,
]);

const ApiLegacyFlatCreditSchemaItemSchema =
	ApiFlatCreditSchemaItemSchema.extend({
		metered_feature_id: z.literal(""),
	});

export const ApiCreditSchemaResponseItemSchema = z.union([
	ApiCreditSchemaItemSchema,
	ApiLegacyFlatCreditSchemaItemSchema,
]);

export type ApiCreditSchemaItem = z.infer<typeof ApiCreditSchemaItemSchema>;
