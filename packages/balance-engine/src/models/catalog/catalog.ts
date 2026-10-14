import {
	EntitlementSchema,
	FeatureSchema,
	PriceSchema,
	ProductSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { openSchema } from "../common/openSchema.js";
import { nonEmptyStringSchema } from "../common/primitives.js";
import { catalogFreeTrialSchema } from "./catalogFreeTrial.js";
import { catalogPlanLicenseSchema } from "./catalogPlanLicense.js";

export const catalogSchema = openSchema({
	name: "catalog",
	schema: z.object({
		entitlements: z.record(nonEmptyStringSchema, EntitlementSchema),
		products: z.record(nonEmptyStringSchema, ProductSchema),
		features: z.record(nonEmptyStringSchema, FeatureSchema),
		prices: z.record(nonEmptyStringSchema, PriceSchema),
		planLicenses: z.record(nonEmptyStringSchema, catalogPlanLicenseSchema),
		freeTrials: z.record(nonEmptyStringSchema, catalogFreeTrialSchema),
	}),
});

export type Catalog = z.infer<typeof catalogSchema>;
