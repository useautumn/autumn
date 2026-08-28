import { z } from "zod/v4";

export const CatalogStripePriceSchema = z.object({
	id: z.string(),
	nickname: z.string().nullable(),
	unit_amount: z.number().nullable(),
	currency: z.string(),
	interval: z.string().nullable(),
	interval_count: z.number().nullable(),
	active: z.boolean(),
	product_id: z.string().nullable(),
	product_name: z.string().nullable(),
});

/**
 * Stripe has no substring search over price ids, so the only useful queries are
 * an exact price id or a product id to list under. Anything else is not a lookup.
 */
export const StripePriceSearchParamsSchema = z.object({
	search: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const StripePriceSearchResponseSchema = z.object({
	stripe_connected: z.boolean(),
	stripe_prices: z.array(CatalogStripePriceSchema),
});

export type CatalogStripePrice = z.infer<typeof CatalogStripePriceSchema>;
export type StripePriceSearchParams = z.infer<
	typeof StripePriceSearchParamsSchema
>;
export type StripePriceSearchResponse = z.infer<
	typeof StripePriceSearchResponseSchema
>;
