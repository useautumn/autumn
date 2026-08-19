import { afterEach, describe, expect, test } from "bun:test";
import { isCloudAgent } from "@autumn/env";
import { wantsCanonicalProvision } from "./registry.ts";

describe("wantsCanonicalProvision", () => {
	const prevCloud = process.env.CLOUD_AGENT;
	const prevLegacy = process.env.DW_HEADLESS;

	afterEach(() => {
		if (prevCloud === undefined) delete process.env.CLOUD_AGENT;
		else process.env.CLOUD_AGENT = prevCloud;
		if (prevLegacy === undefined) delete process.env.DW_HEADLESS;
		else process.env.DW_HEADLESS = prevLegacy;
	});

	test("laptop canonical provisions on the default branch", () => {
		delete process.env.CLOUD_AGENT;
		delete process.env.DW_HEADLESS;
		expect(wantsCanonicalProvision("/repo", "/repo", "dev", "dev")).toBe(true);
	});

	test("Cloud agent never provisions Neon", () => {
		delete process.env.DW_HEADLESS;
		process.env.CLOUD_AGENT = "1";
		expect(
			wantsCanonicalProvision("/workspace", "/workspace", "dev", "dev"),
		).toBe(false);
	});

	test("Cloud detached HEAD does not require a branch", () => {
		delete process.env.DW_HEADLESS;
		process.env.CLOUD_AGENT = "1";
		expect(
			wantsCanonicalProvision("/workspace", "/workspace", undefined, "dev"),
		).toBe(false);
	});

	test("legacy DW_HEADLESS still skips Neon", () => {
		delete process.env.CLOUD_AGENT;
		process.env.DW_HEADLESS = "1";
		expect(isCloudAgent()).toBe(true);
		expect(
			wantsCanonicalProvision("/workspace", "/workspace", "dev", "dev"),
		).toBe(false);
	});
});
