import { describe, expect, test } from "bun:test";
import { isCloudAgent } from "./cloudAgent.js";

describe("isCloudAgent", () => {
	test.each(["1", "true"] as const)("CLOUD_AGENT=%s is a Cloud agent", (value) => {
		expect(isCloudAgent({ env: { CLOUD_AGENT: value } })).toBe(true);
	});

	test.each(["1", "true"] as const)(
		"DW_HEADLESS=%s still counts (legacy name)",
		(value) => {
			expect(isCloudAgent({ env: { DW_HEADLESS: value } })).toBe(true);
		},
	);

	test.each([undefined, "", "0", "false"] as const)(
		"CLOUD_AGENT=%s is a laptop",
		(value) => {
			expect(isCloudAgent({ env: { CLOUD_AGENT: value } })).toBe(false);
		},
	);

	test("reads process.env when no env is passed", () => {
		const prevCloud = process.env.CLOUD_AGENT;
		const prevLegacy = process.env.DW_HEADLESS;
		delete process.env.CLOUD_AGENT;
		delete process.env.DW_HEADLESS;
		try {
			expect(isCloudAgent()).toBe(false);
			process.env.CLOUD_AGENT = "1";
			expect(isCloudAgent()).toBe(true);
		} finally {
			if (prevCloud === undefined) delete process.env.CLOUD_AGENT;
			else process.env.CLOUD_AGENT = prevCloud;
			if (prevLegacy === undefined) delete process.env.DW_HEADLESS;
			else process.env.DW_HEADLESS = prevLegacy;
		}
	});
});
