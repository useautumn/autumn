import {
	EntitlementSchema,
	FeatureSchema,
	PriceSchema,
	ProductSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { catalogPlanLicenseSchema } from "./catalogPlanLicense.js";

/** One catalog row tagged with its table: the shared row as stored, never a pick, because it is cached, not kept in state. */
export const catalogRowSchema = z.discriminatedUnion("table", [
	z.object({ table: z.literal("entitlements"), row: EntitlementSchema }),
	z.object({ table: z.literal("products"), row: ProductSchema }),
	z.object({ table: z.literal("features"), row: FeatureSchema }),
	z.object({ table: z.literal("prices"), row: PriceSchema }),
	z.object({
		table: z.literal("planLicenses"),
		row: catalogPlanLicenseSchema,
	}),
]);

export type CatalogRow = z.infer<typeof catalogRowSchema>;
