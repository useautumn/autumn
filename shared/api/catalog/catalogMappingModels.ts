import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { ApiPlanItemV1Schema } from "@api/products/items/apiPlanItemV1.js";
import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter.js";
import { z } from "zod/v4";

export const CatalogMappingProcessorSchema = z.enum(["stripe"]);
export const CatalogPlanMappingPriceScopeSchema = z.enum([
	"base_price",
	"all_prices",
	"none",
]);

export const CatalogGetMappingsParamsSchema = z
	.object({
		processor_type: CatalogMappingProcessorSchema.default("stripe"),
		stripe_product_search: z.string().optional(),
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
]);

export const CatalogStripeMappingSchema = z.object({
	stripe_product_id: z.string().nullable(),
	stripe_product: CatalogStripeProductSchema.nullable(),
	status: CatalogMappingStatusSchema,
});

export const CatalogPlanMappingSchema = z.object({
	plan_id: z.string(),
	mapping: CatalogStripeMappingSchema,
});

export const CatalogItemMappingSchema = z.object({
	plan_id: z.string(),
	label: z.string(),
	item: ApiPlanItemV1Schema,
	item_filter: PlanItemFilterSchema,
	mapping: CatalogStripeMappingSchema,
});

export const CatalogMappedPlanSchema = z.object({
	plan: ApiPlanV1Schema,
	plan_mapping: CatalogPlanMappingSchema,
	item_mappings: z.array(CatalogItemMappingSchema),
});

export const CatalogGetMappingsResponseSchema = z.object({
	processor_type: CatalogMappingProcessorSchema,
	stripe_connected: z.boolean(),
	stripe_products: z.array(CatalogStripeProductSchema),
	plans: z.array(CatalogMappedPlanSchema),
});

export const CatalogUpdateMappingsParamsSchema = z.object({
	processor_type: CatalogMappingProcessorSchema.default("stripe"),
	plan_mappings: z
		.array(
			z.object({
				plan_id: z.string(),
				stripe_product_id: z.string().nullable(),
				apply_to_prices: CatalogPlanMappingPriceScopeSchema.default(
					"base_price",
				),
			}),
		)
		.default([]),
	item_mappings: z
		.array(
			z.object({
				plan_id: z.string(),
				item: PlanItemFilterSchema,
				stripe_product_id: z.string().nullable(),
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
export type CatalogUpdateMappingsResponse = z.infer<
	typeof CatalogUpdateMappingsResponseSchema
>;
