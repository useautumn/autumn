import { describe, expect, test } from "bun:test";
import { createCacheEnv } from "@autumn/env/cache";

const mainUrl = (env: Record<string, string | undefined>) =>
	createCacheEnv(env).MISC_CACHE_MAIN_URL;

describe("createCacheEnv main URL", () => {
	test("returns null when nothing is configured", () => {
		expect(mainUrl({})).toBeNull();
	});

	test("empty values count as unset", () => {
		expect(
			mainUrl({
				MISC_CACHE_DRAGONFLY_PRIVATE_URL: "  ",
				MISC_CACHE_DRAGONFLY_PUBLIC_URL: "",
			}),
		).toBeNull();
	});

	test("public URL is used off ECS even when private is set", () => {
		expect(
			mainUrl({
				MISC_CACHE_DRAGONFLY_PRIVATE_URL: "rediss://df-private:6385",
				MISC_CACHE_DRAGONFLY_PUBLIC_URL: "rediss://df-public:6385",
			}),
		).toBe("rediss://df-public:6385");
	});

	test("private URL is preferred on ECS", () => {
		expect(
			mainUrl({
				ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4",
				MISC_CACHE_DRAGONFLY_PRIVATE_URL: "rediss://df-private:6385",
				MISC_CACHE_DRAGONFLY_PUBLIC_URL: "rediss://df-public:6385",
			}),
		).toBe("rediss://df-private:6385");
	});

	test("public-only config resolves everywhere", () => {
		expect(
			mainUrl({ MISC_CACHE_DRAGONFLY_PUBLIC_URL: "rediss://df-public:6385" }),
		).toBe("rediss://df-public:6385");
	});

	test("private-only config still resolves off ECS", () => {
		expect(
			mainUrl({ MISC_CACHE_DRAGONFLY_PRIVATE_URL: "rediss://df-private:6385" }),
		).toBe("rediss://df-private:6385");
	});
});
