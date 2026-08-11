import { afterEach, describe, expect, test } from "bun:test";
import { getAutumnEnv } from "@autumn/env";
import { getVercelSdkServerURL } from "@/external/vercel/misc/vercelSdkOptions.js";

describe("getVercelSdkServerURL", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	test("returns undefined by default in development", () => {
		process.env.NODE_ENV = "development";
		expect(getVercelSdkServerURL()).toBeUndefined();
		expect(getVercelSdkServerURL({ mockVercelApi: false })).toBeUndefined();
	});

	test("returns the local mock URL when explicitly enabled", () => {
		process.env.NODE_ENV = "development";
		expect(getVercelSdkServerURL({ mockVercelApi: true })).toBe(
			`${getAutumnEnv().AUTUMN_API_URL}/__test/vercel/api`,
		);
	});

	test("returns undefined in production even when enabled", () => {
		process.env.NODE_ENV = "production";
		expect(getVercelSdkServerURL({ mockVercelApi: true })).toBeUndefined();
	});
});
