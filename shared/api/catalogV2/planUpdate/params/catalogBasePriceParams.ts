import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { ApiPriceProcessorsSchema } from "@api/products/components/processors.js";
import type { z } from "zod/v4";

/**
 * The base price params plus Stripe price adoption. Adoption is scoped to the
 * catalog path: `validateAdoptedStripePrices` only runs in the catalogV2 init
 * flow, so a stated price id on attach/customize/migration would be persisted
 * unchecked and only surface as a Stripe error at checkout. Keep `processors`
 * here rather than on `BasePriceParamsSchema`.
 */
export const CatalogBasePriceParamsSchema = BasePriceParamsSchema.extend({
	processors: ApiPriceProcessorsSchema.optional().meta({
		description:
			"Adopt an existing Stripe price instead of creating one. The id must already exist in Stripe.",
	}),
}).meta({
	title: "CatalogBasePrice",
	description:
		"Base price configuration for a catalog plan, including Stripe price adoption.",
});

export type CatalogBasePriceParams = z.infer<
	typeof CatalogBasePriceParamsSchema
>;
export type CatalogBasePriceParamsInput = z.input<
	typeof CatalogBasePriceParamsSchema
>;
