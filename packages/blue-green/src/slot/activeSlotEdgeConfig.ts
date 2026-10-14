import { z } from "zod/v4";

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

export function activeSlotKeyOf({ serviceName }: { serviceName: string }) {
	return `admin/blue-green-${serviceName}-active-slot.json`;
}

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
