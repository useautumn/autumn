import { describe, expect, test } from "bun:test";
import {
	getRedisV2ConnectionConfig,
	supportsUpstashShebangForRedisV2,
} from "@/external/redis/initUtils/redisV2Config.js";

describe("redis V2 connection config", () => {
	test("uses a distinct CACHE_V2_UPSTASH_URL with the Upstash shebang", () => {
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: " redis://v2 ",
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
			}),
		).toEqual({
			cacheUrl: "redis://v2",
			region: "us-west-2:v2",
			supportsUpstashShebang: true,
		});
	});

	test("falls back to primary Redis when CACHE_V2_UPSTASH_URL is absent or matches primary", () => {
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: undefined,
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
			}),
		).toBeNull();
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: " redis://primary ",
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
			}),
		).toBeNull();
	});

	test("enables the Upstash shebang only for the upstash instance", () => {
		expect(supportsUpstashShebangForRedisV2("upstash")).toBe(true);
		expect(supportsUpstashShebangForRedisV2("redis")).toBe(false);
		expect(supportsUpstashShebangForRedisV2("dragonfly")).toBe(false);
	});
});
