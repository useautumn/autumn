import { describe, expect, test } from "bun:test";
import { repairCachedProductCollections } from "@/internal/customers/cache/repairCachedProductCollections.js";

// Shared safeguard used by both customer cache readers (FullCustomer +
// FullSubject). Upstash cjson collapses an empty `{}` to `[]`, and cache
// entries written before a field existed lack it entirely — both must read
// back as `{}`.
describe("repairCachedProductCollections", () => {
	test("metadata: empty array -> {} (cjson collapse)", () => {
		const product: { config?: unknown; metadata?: unknown } = { metadata: [] };
		repairCachedProductCollections(product);
		expect(product.metadata).toEqual({});
		expect(Array.isArray(product.metadata)).toBe(false);
	});

	test("metadata: missing -> {} (pre-release cache entry)", () => {
		const product: { config?: unknown; metadata?: unknown } = {};
		repairCachedProductCollections(product);
		expect(product.metadata).toEqual({});
	});

	test("metadata: populated object is preserved", () => {
		const value = { tier: "gold", tags: ["a", "b"] };
		const product: { config?: unknown; metadata?: unknown } = {
			metadata: value,
		};
		repairCachedProductCollections(product);
		expect(product.metadata).toEqual(value);
	});

	test("config: [] and missing -> {} (existing behavior preserved)", () => {
		const fromArray: { config?: unknown; metadata?: unknown } = { config: [] };
		repairCachedProductCollections(fromArray);
		expect(fromArray.config).toEqual({});

		const fromMissing: { config?: unknown; metadata?: unknown } = {};
		repairCachedProductCollections(fromMissing);
		expect(fromMissing.config).toEqual({});
	});
});
