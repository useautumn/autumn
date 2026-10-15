import { BillingMethod } from "@api/products/components/billingMethod.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { z } from "zod/v4";

const IntervalNarrowShape = {
	interval: z.enum(BillingInterval).optional().meta({
		description:
			"Only match the price billed on this interval. Needed when the same price exists on more than one interval.",
	}),
	interval_count: z.number().int().positive().optional().meta({
		description: "Only match the price billed every this many intervals.",
	}),
};

const RemoveLinePriceSchema = z
	.union([z.literal(true), z.object(IntervalNarrowShape).strict()])
	.meta({
		description:
			"Remove the base price line. Pass true, or an object to narrow by interval.",
	});

const RemoveLineFeatureQuantitySchema = z
	.object({
		feature_id: z.string().meta({
			description: "The feature whose line to remove.",
		}),
		billing_behavior: z.enum(BillingMethod).meta({
			description:
				"Which of the feature's prices to match: 'prepaid' or 'usage_based'.",
		}),
		...IntervalNarrowShape,
	})
	.strict();

const RemoveLineLicenseQuantitySchema = z
	.object({
		license_plan_id: z.string().meta({
			description: "The license plan linked to the parent plan.",
		}),
		price: RemoveLinePriceSchema.optional(),
		feature_quantities: z.array(RemoveLineFeatureQuantitySchema).optional(),
	})
	.strict();

export const RemoveLineSchema = z
	.object({
		plan_id: z.string().meta({
			description:
				"The plan whose lines to remove: one coming in, going out, or already on the customer and billed by this request.",
		}),
		entity_id: z.string().min(1).nullable().optional().meta({
			description:
				"The entity the lines are billed to. Omit to inherit the request's entity_id, or pass null for customer-level.",
		}),
		direction: z.enum(["charge", "refund"]).optional().meta({
			description:
				"Only remove charges or only remove refunds (credits). Omit to remove both.",
		}),
		price: RemoveLinePriceSchema.optional(),
		feature_quantities: z.array(RemoveLineFeatureQuantitySchema).optional(),
		license_quantities: z.array(RemoveLineLicenseQuantitySchema).optional(),
	})
	.strict()
	.meta({
		title: "RemoveLine",
		description:
			"Removes lines Autumn generated for this invoice. With no price, feature_quantities or license_quantities, every line of the plan is removed.",
	});

export type RemoveLine = z.infer<typeof RemoveLineSchema>;
export type RemoveLineFeatureQuantity = z.infer<
	typeof RemoveLineFeatureQuantitySchema
>;
export type RemoveLinePrice = z.infer<typeof RemoveLinePriceSchema>;
