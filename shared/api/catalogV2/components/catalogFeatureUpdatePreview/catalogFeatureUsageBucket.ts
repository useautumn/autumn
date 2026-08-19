import { z } from "zod/v4";

export const CatalogFeatureUsageSampleSchema = z.object({
	id: z.string(),
	name: z.string(),
});

export const CatalogFeatureUsageBucketSchema = z.object({
	count: z.number().int().nonnegative(),
	count_capped: z.boolean().meta({
		description:
			"True when count hit the server cap (e.g. 10,000); treat as that many or more.",
	}),
	samples: z.array(CatalogFeatureUsageSampleSchema).meta({
		description: "Up to a small sample of ids/names for dialog copy.",
	}),
});

export const CatalogFeatureUsageSchema = z.object({
	plans: CatalogFeatureUsageBucketSchema.meta({
		description:
			"Distinct plans with any plan item referencing this feature (entitlement and/or price, including entity_feature_id).",
	}),
	credit_systems: CatalogFeatureUsageBucketSchema,
	customers: CatalogFeatureUsageBucketSchema.meta({
		description:
			"Customers with entitlements on this feature (plan attach or standalone balance).",
	}),
});

export const emptyCatalogFeatureUsageBucket = () => ({
	count: 0,
	count_capped: false,
	samples: [] as { id: string; name: string }[],
});

export const emptyCatalogFeatureUsage = () => ({
	plans: emptyCatalogFeatureUsageBucket(),
	credit_systems: emptyCatalogFeatureUsageBucket(),
	customers: emptyCatalogFeatureUsageBucket(),
});

export type CatalogFeatureUsageBucket = z.infer<
	typeof CatalogFeatureUsageBucketSchema
>;
export type CatalogFeatureUsage = z.infer<typeof CatalogFeatureUsageSchema>;
