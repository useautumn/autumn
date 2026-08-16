import { afterEach, describe, expect, test } from "bun:test";
import { wantsCanonicalProvision } from "./registry.ts";

describe("wantsCanonicalProvision", () => {
	const prev = process.env.DW_HEADLESS;

	afterEach(() => {
		if (prev === undefined) delete process.env.DW_HEADLESS;
		else process.env.DW_HEADLESS = prev;
	});

	test("laptop canonical provisions on the default branch", () => {
		delete process.env.DW_HEADLESS;
		expect(wantsCanonicalProvision("/repo", "/repo", "dev", "dev")).toBe(true);
	});

	test("headless never provisions Neon", () => {
		process.env.DW_HEADLESS = "1";
		expect(wantsCanonicalProvision("/workspace", "/workspace", "dev", "dev")).toBe(
			false,
		);
	});
});
