import { describe, expect, test } from "bun:test";
import {
	MAX_PROPERTY_FILTERS,
	toFilterBy,
	toPropertyFilters,
	withoutPropertyFilter,
	withPropertyFilter,
} from "@/views/event-logs/hooks/useLogsFilters";

describe("property filters from the URL", () => {
	test("malformed entries neither show nor count towards the limit", () => {
		const properties = ["bad1", "bad2", "=x", "y=", "bad5", "model=sonnet-5"];
		const propertyFilters = toPropertyFilters({ properties });
		expect(propertyFilters).toEqual([{ key: "model", value: "sonnet-5" }]);
		expect(propertyFilters.length).toBeLessThan(MAX_PROPERTY_FILTERS);
	});

	test("one filter per key, the later value winning", () => {
		const propertyFilters = toPropertyFilters({
			properties: ["model=a", "region=us", "model=b"],
		});
		expect(toFilterBy({ propertyFilters })).toEqual({
			region: "us",
			model: "b",
		});
	});

	test("writing back drops malformed entries", () => {
		const propertyFilters = toPropertyFilters({
			properties: ["bad", "model=a", "region=us"],
		});
		expect(
			withPropertyFilter({
				propertyFilters,
				filter: { key: "model", value: "b" },
			}),
		).toEqual(["region=us", "model=b"]);
		expect(withoutPropertyFilter({ propertyFilters, key: "region" })).toEqual([
			"model=a",
		]);
	});
});
