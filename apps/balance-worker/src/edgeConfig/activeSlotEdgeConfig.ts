import { z } from "zod/v4";

export const BALANCE_WORKER_ACTIVE_SLOT_KEY =
	"admin/blue-green-balance-workers-active-slot.json";

export const ActiveSlotEdgeConfigSchema = z.object({
	activeTaskDefinitionArn: z.string().nullable(),
	activeImageSha: z.string().nullable(),
	flightcontrolBlueArn: z.string().nullable().optional(),
	updatedAt: z.string(),
	updatedBy: z.string().optional(),
	reason: z.string().optional(),
});

export type ActiveSlotEdgeConfig = z.infer<typeof ActiveSlotEdgeConfigSchema>;

export const defaultActiveSlotEdgeConfig = (): ActiveSlotEdgeConfig => ({
	activeTaskDefinitionArn: null,
	activeImageSha: null,
	updatedAt: new Date(0).toISOString(),
});

export const activeSlotEdgeConfig = {
	key: BALANCE_WORKER_ACTIVE_SLOT_KEY,
	schema: ActiveSlotEdgeConfigSchema,
	defaultValue: defaultActiveSlotEdgeConfig,
} as const;
