import { describe, expect, test } from "bun:test";
import {
	getAlternateRedisV2ConnectionConfig,
	getRedisV2ConnectionConfig,
} from "@/external/redis/initUtils/redisV2Config.js";

describe("redis V2 connection config", () => {
	test("uses a distinct CACHE_V2_URL without the Upstash shebang", () => {
		expect(
			getRedisV2ConnectionConfig({
				cacheV2Url: " redis://v2 ",
				primaryCacheUrl: "redis://primary",
				currentRegion: "us-west-2",
			}),
		).toEqual({
			cacheUrl: "redis://v2",
			region: "us-west-2:v2",
			supportsUpstashShebang: false,
		});
	});

	test("falls back to primary Redis when CACHE_V2_URL is absent or primary", () => {
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

	test("enables the Upstash shebang only for the canary alternate", () => {
		expect(
			getAlternateRedisV2ConnectionConfig({
				name: "canary",
				cacheUrl: " redis://canary ",
				currentRegion: "us-west-2",
			}),
		).toEqual({
			cacheUrl: "redis://canary",
			region: "us-west-2:v2:canary",
			supportsUpstashShebang: true,
		});
		expect(
			getAlternateRedisV2ConnectionConfig({
				name: "dragonfly",
				cacheUrl: "redis://dragonfly",
				currentRegion: "us-west-2",
			}),
		).toEqual({
			cacheUrl: "redis://dragonfly",
			region: "us-west-2:v2:dragonfly",
			supportsUpstashShebang: false,
		});
	});

	test("ignores blank alternate Redis V2 URLs", () => {
		expect(
			getAlternateRedisV2ConnectionConfig({
				name: "canary",
				cacheUrl: " ",
				currentRegion: "us-west-2",
			}),
		).toBeNull();
	});
});
