import { z } from "zod/v4";

export const PreviewPlanItemChangeSchema = z.object({
	action: z.enum(["created", "updated", "deleted"]),
	feature_id: z.string(),
	previous_attributes: z.record(z.string(), z.unknown()).default({}),
});

export const PreviewPlanChangeSchema = z.object({
	action: z.enum(["created", "updated", "deleted"]),
	plan_id: z.string(),
	entity_id: z.string().nullable().optional(),
	item_changes: z.array(PreviewPlanItemChangeSchema).default([]),
});

export type PreviewPlanItemChange = z.infer<typeof PreviewPlanItemChangeSchema>;

export type PreviewPlanChange = z.infer<typeof PreviewPlanChangeSchema>;
