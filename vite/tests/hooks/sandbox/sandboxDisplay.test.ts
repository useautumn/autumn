import { describe, expect, test } from "bun:test";
import { sandboxColorValue } from "@/hooks/sandbox/sandboxDisplay";

describe("sandboxColorValue", () => {
	test("maps sandbox colors to their display values", () => {
		expect(sandboxColorValue("red")).toBe("#fb2c36");
	});

	test("falls back to the default sandbox color", () => {
		expect(sandboxColorValue("unknown")).toBe("#6a7282");
	});
});
