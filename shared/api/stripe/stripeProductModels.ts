import { z } from "zod/v4";
import { CatalogStripeProductSchema } from "../catalog/catalogMappingModels.js";

export const StripeProductSearchParamsSchema = z.object({
	search: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const StripeProductSearchResponseSchema = z.object({
	stripe_connected: z.boolean(),
	stripe_products: z.array(CatalogStripeProductSchema),
});

export const StripeProductResolveParamsSchema = z.object({
	stripe_product_ids: z.array(z.string()).max(500).default([]),
});

export const StripeProductResolveResponseSchema =
	StripeProductSearchResponseSchema;

export type StripeProductSearchParams = z.infer<
	typeof StripeProductSearchParamsSchema
>;
export type StripeProductSearchResponse = z.infer<
	typeof StripeProductSearchResponseSchema
>;
export type StripeProductResolveParams = z.infer<
	typeof StripeProductResolveParamsSchema
>;
export type StripeProductResolveResponse = z.infer<
	typeof StripeProductResolveResponseSchema
>;
