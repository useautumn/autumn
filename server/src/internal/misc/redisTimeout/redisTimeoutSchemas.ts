import { z } from "zod/v4";

/**
 * `commandTimeoutMs`:
 * - positive integer → applied as the ioredis `commandTimeout` option
 * - `null` → no command timeout (ioredis will wait indefinitely for a reply)
 */
export const RedisTimeoutConfigSchema = z.object({
	commandTimeoutMs: z.number().int().positive().nullable().default(100000),
});

export type RedisTimeoutConfig = z.infer<typeof RedisTimeoutConfigSchema>;
