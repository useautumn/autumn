import { z } from "zod/v4";

/** Which ECS service Flightcontrol currently calls Blue; the dashboard writes it, every worker polls it. */
export const BALANCE_WORKER_ACTIVE_SLOT_KEY =
	"admin/blue-green-balance-workers-active-slot.json";

/** Mirrors the server's `ActiveSlotConfigSchema`; `flightcontrolBlueArn` is the only field the gate reads. */
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
