import { z } from "zod/v4";

export const RateLimitRedisAllowlistConfigSchema = z.object({
	customerIds: z.array(z.string().min(1)).default([]),
});

export type RateLimitRedisAllowlistConfig = {
	customerIds: string[];
};
