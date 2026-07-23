import { z } from "zod/v4";

export const MainRedisInstanceName = z.enum(["primary", "fallback"]);
export type MainRedisInstanceName = z.infer<typeof MainRedisInstanceName>;

export const MainRedisCacheConfigSchema = z.object({
	activeInstance: MainRedisInstanceName.default("primary"),
});

export type MainRedisCacheConfig = z.infer<typeof MainRedisCacheConfigSchema>;
