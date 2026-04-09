import { z } from "zod/v4";

export const AnalyticsMaintenanceSchema = z.object({
	disableRevenueMetrics: z.boolean().default(false),
});

export const MaintenanceModesSchema = z.object({
	analytics: AnalyticsMaintenanceSchema.default(() => ({
		disableRevenueMetrics: false,
	})),
});

export const FeatureFlagConfigSchema = z.object({
	maintenanceModes: MaintenanceModesSchema.default(() => ({
		analytics: { disableRevenueMetrics: false },
	})),
	/** Per-org, per-customer override for skip_overage_submission. */
	skipOverageSubmissionFlags: z
		.record(z.string(), z.array(z.string()))
		.default({}),
});

export type AnalyticsMaintenance = z.infer<typeof AnalyticsMaintenanceSchema>;
export type MaintenanceModes = z.infer<typeof MaintenanceModesSchema>;
export type FeatureFlagConfig = z.infer<typeof FeatureFlagConfigSchema>;
