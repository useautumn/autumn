import { z } from "zod/v4";

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

/** Which ECS service Flightcontrol currently calls Blue for one service; the dashboard writes it, every task polls it. */
export function activeSlotKeyOf({ serviceName }: { serviceName: string }) {
	return `admin/blue-green-${serviceName}-active-slot.json`;
}

/** The store definition for one service's record: key, schema and default, ready for `createEdgeConfigStore`. */
export function activeSlotEdgeConfigOf({
	serviceName,
}: {
	serviceName: string;
}) {
	return {
		key: activeSlotKeyOf({ serviceName }),
		schema: ActiveSlotEdgeConfigSchema,
		defaultValue: defaultActiveSlotEdgeConfig,
	} as const;
}
