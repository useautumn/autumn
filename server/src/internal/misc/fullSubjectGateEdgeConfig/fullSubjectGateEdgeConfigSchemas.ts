import { z } from "zod/v4";

export const FullSubjectGateEdgeConfigSchema = z.object({
	per_customer_limit: z.number().int().min(1).max(10_000).default(15),
	per_org_limit: z.number().int().min(1).max(10_000).default(30),
});

export type FullSubjectGateEdgeConfig = z.infer<
	typeof FullSubjectGateEdgeConfigSchema
>;
