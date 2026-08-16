import { describe, expect, test } from "bun:test";
import { isDwHeadless } from "./dw.js";

describe("isDwHeadless", () => {
	test("is true only for 1 or true", () => {
		expect(isDwHeadless({ DW_HEADLESS: "1" })).toBe(true);
		expect(isDwHeadless({ DW_HEADLESS: "true" })).toBe(true);
		expect(isDwHeadless({ DW_HEADLESS: "0" })).toBe(false);
		expect(isDwHeadless({})).toBe(false);
	});
});
