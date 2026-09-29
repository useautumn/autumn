import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const catalogTableSchema = z.enum([
	"entitlements",
	"products",
	"features",
	"prices",
	"planLicenses",
	"freeTrials",
]);

export type CatalogTable = z.infer<typeof catalogTableSchema>;

/** Which catalog row a state references: entitlements, prices, plan licenses and free trials by id, products and features by internal_id. */
export const catalogKeySchema = z
	.object({ table: catalogTableSchema, id: nonEmptyStringSchema })
	.strict();

export type CatalogKey = z.infer<typeof catalogKeySchema>;
