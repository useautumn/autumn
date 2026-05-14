import { describe, expect, test } from "bun:test";
import {
	getRedisV2ConnectionConfig,
	REDIS_V2_COMMAND_TIMEOUT_MS,
	supportsUpstashShebangForRedisV2,
} from "@/external/redis/initUtils/redisV2Config.js";

describe("redis V2 connection config", () => {
	test("uses a distinct CACHE_V2_DRAGONFLY_URL without the Upstash shebang", () => {
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: " redis://v2 ",
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
				instanceName: "dragonfly",
			}),
		).toEqual({
			cacheUrl: "redis://v2",
			region: "us-west-2:v2",
			supportsUpstashShebang: false,
			commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
		});
	});

	test("uses the Upstash shebang when the upstash instance is selected", () => {
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: " redis://v2 ",
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
				instanceName: "upstash",
			}),
		).toMatchObject({
			supportsUpstashShebang: true,
		});
	});

	test("falls back to primary Redis when the V2 URL is absent or matches primary", () => {
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: undefined,
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
				instanceName: "dragonfly",
			}),
		).toBeNull();
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: " redis://primary ",
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
				instanceName: "dragonfly",
			}),
		).toBeNull();
	});

	test("enables the Upstash shebang only for the upstash instance", () => {
		expect(supportsUpstashShebangForRedisV2("upstash")).toBe(true);
		expect(supportsUpstashShebangForRedisV2("redis")).toBe(false);
		expect(supportsUpstashShebangForRedisV2("dragonfly")).toBe(false);
	});
});
