import { z } from "zod/v4";
import type { Feature } from "../../featureModels/featureModels.js";
import {
	DbSpendLimitSchema,
	DbUsageAlertSchema,
} from "../billingControls/customerBillingControls.js";

export const EntitySchema = z.object({
	id: z.string().nullable(),
	org_id: z.string(),
	created_at: z.number(),
	internal_id: z.string(),
	internal_customer_id: z.string(),
	env: z.string(),
	name: z.string().nullable(),
	deleted: z.boolean(),
	feature_id: z.string(),
	internal_feature_id: z.string(),
	spend_limits: z.array(DbSpendLimitSchema).nullish(),
	usage_alerts: z.array(DbUsageAlertSchema).nullish(),
});

// export const CreateEntitySchema = z.object({
// 	id: z.string(),
// 	name: z.string().nullish(),
// 	feature_id: z.string(),
// });

// export const EntityDataSchema = z.object({
// 	name: z.string().nullish(), // Name of entity
// 	feature_id: z.string(), // Feature ID of entity
// });

export type Entity = z.infer<typeof EntitySchema>;
export type EntityWithFeature = Entity & {
	feature: Feature;
};
// export type CreateEntity = z.infer<typeof CreateEntitySchema>;
// export type EntityData = z.infer<typeof EntityDataSchema>;
