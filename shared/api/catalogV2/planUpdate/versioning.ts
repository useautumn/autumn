import { z } from "zod/v4";

export const CatalogPlanVersioningStrategySchema = z.enum([
	"existing",
	"new_version",
	"all_versions",
]);

export type CatalogPlanVersioningStrategy = z.infer<
	typeof CatalogPlanVersioningStrategySchema
>;
