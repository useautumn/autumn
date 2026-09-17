import {
	EntitlementSchema,
	FeatureSchema,
	PriceSchema,
	ProductSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

/** The rows a state references, keyed the way compute looks them up: entitlements and prices by id, products and features by internal_id. */
export const catalogSchema = z
	.object({
		entitlements: z.record(nonEmptyStringSchema, EntitlementSchema),
		products: z.record(nonEmptyStringSchema, ProductSchema),
		features: z.record(nonEmptyStringSchema, FeatureSchema),
		prices: z.record(nonEmptyStringSchema, PriceSchema),
	})
	.strict();

export type Catalog = z.infer<typeof catalogSchema>;
