import { z } from "zod/v4";
import { openEnum } from "../common/openSchema.js";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const catalogTableSchema = openEnum({
	name: "catalogTable",
	values: [
		"entitlements",
		"products",
		"features",
		"prices",
		"planLicenses",
		"freeTrials",
	],
});

export type CatalogTable = z.infer<typeof catalogTableSchema>;

export const catalogKeySchema = z
	.object({ table: catalogTableSchema, id: nonEmptyStringSchema })
	.loose();

export type CatalogKey = z.infer<typeof catalogKeySchema>;
