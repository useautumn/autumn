import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveMiscMainUrl } from "@/external/redis/initUtils/redisConfig.js";

const ENV_KEYS = [
	"MISC_CACHE_DRAGONFLY_PRIVATE_URL",
	"MISC_CACHE_DRAGONFLY_PUBLIC_URL",
	"ECS_CONTAINER_METADATA_URI_V4",
] as const;

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
	{};

beforeEach(() => {
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = savedEnv[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("resolveMiscMainUrl", () => {
	test("returns null when nothing is configured", () => {
		expect(resolveMiscMainUrl()).toBeNull();
	});

	test("empty values count as unset", () => {
		process.env.MISC_CACHE_DRAGONFLY_PRIVATE_URL = "  ";
		process.env.MISC_CACHE_DRAGONFLY_PUBLIC_URL = "";
		expect(resolveMiscMainUrl()).toBeNull();
	});

	test("public URL is used off ECS even when private is set", () => {
		process.env.MISC_CACHE_DRAGONFLY_PRIVATE_URL = "rediss://df-private:6385";
		process.env.MISC_CACHE_DRAGONFLY_PUBLIC_URL = "rediss://df-public:6385";
		expect(resolveMiscMainUrl()).toBe("rediss://df-public:6385");
	});

	test("private URL is preferred on ECS", () => {
		process.env.ECS_CONTAINER_METADATA_URI_V4 = "http://169.254.170.2/v4";
		process.env.MISC_CACHE_DRAGONFLY_PRIVATE_URL = "rediss://df-private:6385";
		process.env.MISC_CACHE_DRAGONFLY_PUBLIC_URL = "rediss://df-public:6385";
		expect(resolveMiscMainUrl()).toBe("rediss://df-private:6385");
	});

	test("public-only config resolves everywhere", () => {
		process.env.MISC_CACHE_DRAGONFLY_PUBLIC_URL = "rediss://df-public:6385";
		expect(resolveMiscMainUrl()).toBe("rediss://df-public:6385");
	});

	test("private-only config still resolves off ECS", () => {
		process.env.MISC_CACHE_DRAGONFLY_PRIVATE_URL = "rediss://df-private:6385";
		expect(resolveMiscMainUrl()).toBe("rediss://df-private:6385");
	});
});
