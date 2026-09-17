import {
	EntitlementSchema,
	FeatureSchema,
	ProductSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

/** The catalog rows a set of ids names, fetched in one round trip. */
export const catalogRowsEnvelopeSchema = z.object({
	entitlements: z.array(EntitlementSchema),
	products: z.array(ProductSchema),
	features: z.array(FeatureSchema),
});

export type CatalogRowsEnvelope = z.infer<typeof catalogRowsEnvelopeSchema>;

/** Which rows to fetch: entitlements by id, products and features by internal_id. */
export type CatalogRowIds = {
	entitlementIds: string[];
	productInternalIds: string[];
	featureInternalIds: string[];
};
