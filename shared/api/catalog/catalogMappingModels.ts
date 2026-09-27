import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter.js";
import { z } from "zod/v4";

export const CatalogMappingProcessorSchema = z.enum(["stripe"]);
export const CatalogPlanMappingPriceScopeSchema = z.enum([
	"base_price",
	"none",
]);

export const CatalogGetMappingsParamsSchema = z
	.object({
		processor_type: CatalogMappingProcessorSchema.default("stripe"),
	})
	.default({ processor_type: "stripe" });

export const CatalogStripeProductSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	active: z.boolean(),
});

export const CatalogMappingStatusSchema = z.enum([
	"unmapped",
	"ok",
	"missing",
	"inactive",
	"unchecked",
	"conflict",
]);

export const CatalogStripeMappingSchema = z.object({
	stripe_product_id: z.string().nullable(),
	stripe_product: CatalogStripeProductSchema.nullable(),
	status: CatalogMappingStatusSchema,
});

export const CatalogItemMappingSchema = z.object({
	label: z.string(),
	filter: PlanItemFilterSchema,
	mapping: CatalogStripeMappingSchema,
});

export const CatalogPlanMappingSchema = z.object({
	plan_id: z.string(),
	mapping: CatalogStripeMappingSchema,
	/** Extra Stripe products that also resolve to this plan when syncing from Stripe. */
	additional_mappings: z.array(CatalogStripeMappingSchema).default([]),
	item_mappings: z.array(CatalogItemMappingSchema),
});

export const CatalogGetMappingsResponseSchema = z.object({
	processor_type: CatalogMappingProcessorSchema,
	stripe_connected: z.boolean(),
	stripe_products: z.array(CatalogStripeProductSchema),
	plan_mappings: z.array(CatalogPlanMappingSchema),
});

export const CatalogUpdateMappingsParamsSchema = z.object({
	processor_type: CatalogMappingProcessorSchema.default("stripe"),
	plan_mappings: z
		.array(
			z.object({
				plan_id: z.string(),
				stripe_product_id: z.string().nullable(),
				additional_stripe_product_ids: z.array(z.string()).default([]),
				scope: CatalogPlanMappingPriceScopeSchema.default("base_price"),
				item_mappings: z
					.array(
						z.object({
							filter: PlanItemFilterSchema,
							stripe_product_id: z.string().nullable(),
						}),
					)
					.default([]),
			}),
		)
		.default([]),
	/** Sets a feature's default Stripe product; prices still on the old default move with it. */
	feature_mappings: z
		.array(
			z.object({
				feature_id: z.string(),
				stripe_product_id: z.string().nullable(),
				/** Creates a new Stripe product for the feature, ignoring `stripe_product_id`. */
				create_stripe_product: z.boolean().default(false),
			}),
		)
		.default([]),
	/** Pins one Autumn price to a Stripe product, and optionally an existing Stripe price. */
	price_mappings: z
		.array(
			z.object({
				price_id: z.string(),
				stripe_product_id: z.string().nullable(),
				stripe_price_id: z.string().nullable().default(null),
				/** Creates a new Stripe product for this price, ignoring `stripe_product_id`. */
				create_stripe_product: z.boolean().default(false),
			}),
		)
		.default([]),
});

export const CatalogUpdateMappingsResponseSchema =
	CatalogGetMappingsResponseSchema;

export type CatalogGetMappingsParams = z.infer<
	typeof CatalogGetMappingsParamsSchema
>;
export type CatalogStripeProduct = z.infer<typeof CatalogStripeProductSchema>;
export type CatalogStripeMapping = z.infer<typeof CatalogStripeMappingSchema>;
export type CatalogGetMappingsResponse = z.infer<
	typeof CatalogGetMappingsResponseSchema
>;
export type CatalogUpdateMappingsParams = z.infer<
	typeof CatalogUpdateMappingsParamsSchema
>;
export type CatalogUpdateMappingsParamsInput = z.input<
	typeof CatalogUpdateMappingsParamsSchema
>;
export type CatalogUpdateMappingsResponse = z.infer<
	typeof CatalogUpdateMappingsResponseSchema
>;
