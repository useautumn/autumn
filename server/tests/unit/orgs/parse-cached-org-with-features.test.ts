import { describe, expect, it } from "bun:test";
import { parseCachedOrgWithFeatures } from "@/internal/orgs/orgUtils/cacheOrgWithFeatures.js";

describe("parseCachedOrgWithFeatures", () => {
	it("reads an empty cache slot as a miss", () => {
		expect(parseCachedOrgWithFeatures({ cached: null })).toBe(null);
		expect(parseCachedOrgWithFeatures({ cached: "" })).toBe(null);
	});

	it("parses a valid cache entry", () => {
		const entry = { org: { id: "org_1" }, features: [] };
		const parsed = parseCachedOrgWithFeatures({
			cached: JSON.stringify(entry),
		});

		expect(parsed?.org.id).toBe(entry.org.id);
		expect(parsed?.features).toEqual(entry.features);
	});

	it("reads a corrupt cache entry as a miss instead of throwing", () => {
		expect(parseCachedOrgWithFeatures({ cached: "{not json" })).toBe(null);
		expect(parseCachedOrgWithFeatures({ cached: "\0binary" })).toBe(null);
	});

	it("reads valid JSON with the wrong shape as a miss", () => {
		for (const cached of [
			"{}",
			"[]",
			"null",
			"42",
			'"org_1"',
			'{"org":null,"features":[]}',
			'{"org":{},"features":[]}',
			'{"org":{"id":""},"features":[]}',
			'{"org":{"id":"org_1"},"features":"nope"}',
			'{"features":[]}',
		]) {
			expect(parseCachedOrgWithFeatures({ cached })).toBe(null);
		}
	});
});
