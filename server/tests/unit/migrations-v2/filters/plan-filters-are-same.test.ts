/**
 * planFiltersAreSame: field-by-field. Key order, omitted vs false, and
 * bare vs `$eq` are the cases JSON.stringify gets wrong.
 */

import { describe, expect, test } from "bun:test";
import {
	collectPlanFilterPlanIds,
	planFiltersAreSame,
} from "@autumn/shared/api/products/utils/compare/planFiltersAreSame.js";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";

const same = (left: PlanFilter, right: PlanFilter) =>
	planFiltersAreSame({ left, right });

describe("planFiltersAreSame — identity / key order", () => {
	test("undefined vs {} are both unconstrained", () => {
		expect(planFiltersAreSame({ left: undefined, right: {} })).toBe(true);
	});

	test("key order does not matter", () => {
		expect(
			same(
				{ plan_id: "pro", version: 1, custom: false },
				{ custom: false, plan_id: "pro", version: 1 },
			),
		).toBe(true);
	});
});

describe("planFiltersAreSame — falsey / omitted", () => {
	test("omitted custom !== custom: false", () => {
		expect(same({ plan_id: "pro" }, { plan_id: "pro", custom: false })).toBe(
			false,
		);
	});

	test("omitted version !== version: 1", () => {
		expect(
			same(
				{ plan_id: "pro", custom: false },
				{ plan_id: "pro", version: 1, custom: false },
			),
		).toBe(false);
	});

	test("custom: false !== custom: true", () => {
		expect(
			same({ plan_id: "pro", custom: false }, { plan_id: "pro", custom: true }),
		).toBe(false);
	});

	test("omitted $or !== empty $or (empty matches nothing)", () => {
		expect(same({ plan_id: "pro" }, { plan_id: "pro", $or: [] })).toBe(false);
	});
});

describe("planFiltersAreSame — matchers", () => {
	test("bare plan_id === { $eq }", () => {
		expect(same({ plan_id: "pro" }, { plan_id: { $eq: "pro" } })).toBe(true);
	});

	test("bare version === { $eq }", () => {
		expect(same({ version: 1 }, { version: { $eq: 1 } })).toBe(true);
	});

	test("$in order does not matter", () => {
		expect(
			same(
				{ plan_id: { $in: ["pro", "free"] } },
				{ plan_id: { $in: ["free", "pro"] } },
			),
		).toBe(true);
	});

	test("bare plan_id !== $eq plus another op", () => {
		expect(
			same({ plan_id: "pro" }, { plan_id: { $eq: "pro", $ne: "free" } }),
		).toBe(false);
	});
});

describe("planFiltersAreSame — $or", () => {
	test("branch order does not matter", () => {
		expect(
			same(
				{ $or: [{ plan_id: "team" }, { plan_id: "scale" }], custom: false },
				{ $or: [{ plan_id: "scale" }, { plan_id: "team" }], custom: false },
			),
		).toBe(true);
	});

	test("different branches are not the same", () => {
		expect(
			same(
				{ $or: [{ plan_id: "team" }], custom: false },
				{ $or: [{ plan_id: "scale" }], custom: false },
			),
		).toBe(false);
	});
});

describe("collectPlanFilterPlanIds", () => {
	test("collects bare, $eq, $in, and $or — not $ne", () => {
		expect(
			collectPlanFilterPlanIds({
				planFilter: {
					plan_id: { $eq: "team", $ne: "ghost" },
					$or: [{ plan_id: "scale" }, { plan_id: { $in: ["plus"] } }],
				},
			}),
		).toEqual(["team", "scale", "plus"]);
	});

	test("substring ids are distinct", () => {
		const ids = collectPlanFilterPlanIds({
			planFilter: { plan_id: "pro_plus" },
		});
		expect(ids).toEqual(["pro_plus"]);
		expect(ids.includes("pro")).toBe(false);
	});
});
