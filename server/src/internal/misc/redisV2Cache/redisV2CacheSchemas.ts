import { z } from "zod/v4";

export const RedisV2InstanceName = z.enum(["upstash", "redis", "dragonfly"]);
export type RedisV2InstanceName = z.infer<typeof RedisV2InstanceName>;

export const RedisV2CacheConfigSchema = z.object({
	activeInstance: RedisV2InstanceName.default("upstash"),
});

export type RedisV2CacheConfig = z.infer<typeof RedisV2CacheConfigSchema>;
