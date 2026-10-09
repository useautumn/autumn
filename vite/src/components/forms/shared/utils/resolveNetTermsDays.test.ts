import { describe, expect, test } from "bun:test";
import { resolveNetTermsDays } from "./resolveNetTermsDays";

describe("resolveNetTermsDays", () => {
	test("prefills a send_invoice subscription's own net terms", () => {
		expect(
			resolveNetTermsDays({ netTermsDays: null, defaultNetTermsDays: 45 }),
		).toBe(45);
	});

	test("keeps what the user typed or a template set", () => {
		expect(
			resolveNetTermsDays({ netTermsDays: 14, defaultNetTermsDays: 45 }),
		).toBe(14);
	});

	test("falls back to 30 days with no default", () => {
		expect(resolveNetTermsDays({ netTermsDays: null })).toBe(30);
	});
});
