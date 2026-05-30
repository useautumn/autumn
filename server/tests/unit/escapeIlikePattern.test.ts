import { describe, expect, test } from "bun:test";

const escapeIlikePattern = (input: string): string =>
	input.replace(/[%_\\]/g, "\\$&");

describe("escapeIlikePattern", () => {
	test("passes through plain text unchanged", () => {
		expect(escapeIlikePattern("hello")).toBe("hello");
	});

	test("escapes % wildcard", () => {
		expect(escapeIlikePattern("50%")).toBe("50\\%");
	});

	test("escapes _ single-char wildcard", () => {
		expect(escapeIlikePattern("us_r")).toBe("us\\_r");
	});

	test("escapes backslash", () => {
		expect(escapeIlikePattern("path\\to")).toBe("path\\\\to");
	});

	test("escapes multiple wildcards in one string", () => {
		expect(escapeIlikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
	});

	test("handles empty string", () => {
		expect(escapeIlikePattern("")).toBe("");
	});

	test("leaves normal entity IDs unchanged", () => {
		expect(escapeIlikePattern("dispersive-preview")).toBe(
			"dispersive-preview",
		);
		expect(escapeIlikePattern("6a13cf0b9b6845d6edbb4aa4")).toBe(
			"6a13cf0b9b6845d6edbb4aa4",
		);
	});
});
