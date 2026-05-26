import { afterEach, describe, expect, test } from "bun:test";
import { getVercelSdkServerURL } from "@/external/vercel/misc/vercelSdkOptions.js";

describe("getVercelSdkServerURL", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		if (originalBetterAuthUrl === undefined) {
			delete process.env.BETTER_AUTH_URL;
		} else {
			process.env.BETTER_AUTH_URL = originalBetterAuthUrl;
		}
	});

	test("returns undefined by default in development", () => {
		process.env.NODE_ENV = "development";
		process.env.BETTER_AUTH_URL = "http://localhost:8080";

		expect(getVercelSdkServerURL()).toBeUndefined();
		expect(getVercelSdkServerURL({ mockVercelApi: false })).toBeUndefined();
	});

	test("returns the local mock URL when explicitly enabled", () => {
		process.env.NODE_ENV = "development";
		process.env.BETTER_AUTH_URL = "http://localhost:8080/";

		expect(getVercelSdkServerURL({ mockVercelApi: true })).toBe(
			"http://localhost:8080/__test/vercel/api",
		);
	});

	test("returns undefined in production even when enabled", () => {
		process.env.NODE_ENV = "production";
		process.env.BETTER_AUTH_URL = "http://localhost:8080";

		expect(getVercelSdkServerURL({ mockVercelApi: true })).toBeUndefined();
	});
});
