import { describe, expect, it } from "bun:test";
import { classifyVersionGuard } from "../../../../src/internal/projector/classifyVersionGuard.js";

describe("classifyVersionGuard", () => {
	it("calls an entry at the cursor a duplicate", () => {
		expect(classifyVersionGuard({ entryVersion: 7, storedVersion: 7 })).toBe(
			"duplicate",
		);
	});

	it("calls an entry behind the cursor a duplicate", () => {
		expect(classifyVersionGuard({ entryVersion: 3, storedVersion: 7 })).toBe(
			"duplicate",
		);
	});

	it("calls an entry past the cursor a gap", () => {
		expect(classifyVersionGuard({ entryVersion: 9, storedVersion: 7 })).toBe(
			"gap",
		);
	});

	it("calls any entry past the first a gap when the subject is unknown", () => {
		expect(
			classifyVersionGuard({ entryVersion: 2, storedVersion: undefined }),
		).toBe("gap");
	});
});
