import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { ApiPriceProcessorsSchema } from "@api/products/components/processors.js";
import type { z } from "zod/v4";

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
