import { z } from "zod/v4";

export const AgentProvisionRateLimitConfigSchema = z.object({
	globalRequestsPerHour: z.number().int().min(0).max(1_000_000).optional(),
	requestsPerIpPerHour: z.number().int().min(0).max(1_000_000).optional(),
});

export type AgentProvisionRateLimitConfig = z.infer<
	typeof AgentProvisionRateLimitConfigSchema
>;
