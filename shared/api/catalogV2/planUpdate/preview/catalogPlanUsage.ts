import {
	CatalogFeatureUsageBucketSchema,
	emptyCatalogFeatureUsageBucket,
} from "@api/catalogV2/components/catalogFeatureUpdatePreview/catalogFeatureUsageBucket.js";
import { z } from "zod/v4";

export const CatalogPlanUsageSchema = z.object({
	customers: CatalogFeatureUsageBucketSchema,
	license_parents: CatalogFeatureUsageBucketSchema,
	reward_programs: CatalogFeatureUsageBucketSchema,
	variants: CatalogFeatureUsageBucketSchema,
});

export const emptyCatalogPlanUsage = () => ({
	customers: emptyCatalogFeatureUsageBucket(),
	license_parents: emptyCatalogFeatureUsageBucket(),
	reward_programs: emptyCatalogFeatureUsageBucket(),
	variants: emptyCatalogFeatureUsageBucket(),
});

export type CatalogPlanUsage = z.infer<typeof CatalogPlanUsageSchema>;
