import { describe, expect, test } from "bun:test";
import { supportsUpstashShebangForRedisV2 } from "@/external/redis/initUtils/redisV2Config.js";

describe("redis V2 connection config", () => {
	test("enables the Upstash shebang only for the upstash instance", () => {
		expect(supportsUpstashShebangForRedisV2("upstash")).toBe(true);
		expect(supportsUpstashShebangForRedisV2("redis")).toBe(false);
		expect(supportsUpstashShebangForRedisV2("dragonfly")).toBe(false);
	});
});
