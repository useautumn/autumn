import { describe, expect, test } from "bun:test";
import {
	collapseFullyPinnedPlan,
	planScopeIncludesVersion,
	planScopeIsWholePlan,
	planScopeLabel,
	planScopePinnedVersions,
	togglePlanVersion,
	toggleWholePlan,
} from "@/components/plans/planScopeSelection";

describe("plan scope selection", () => {
	test("whole plan and pinned versions are mutually exclusive", () => {
		expect(
			toggleWholePlan({ selectedKeys: ["team:1"], planId: "team" }),
		).toEqual(["team"]);
		expect(
			togglePlanVersion({ selectedKeys: ["team"], planId: "team", version: 1 }),
		).toEqual(["team:1"]);
	});

	test("toggling off removes only that key", () => {
		expect(
			toggleWholePlan({ selectedKeys: ["team", "eu:1"], planId: "team" }),
		).toEqual(["eu:1"]);
		expect(
			togglePlanVersion({
				selectedKeys: ["team:1", "team:2"],
				planId: "team",
				version: 2,
			}),
		).toEqual(["team:1"]);
	});

	test("other plans are untouched by a whole-plan pick", () => {
		expect(
			toggleWholePlan({ selectedKeys: ["eu:1", "team:2"], planId: "team" }),
		).toEqual(["eu:1", "team"]);
	});

	test("reads scope membership", () => {
		expect(
			planScopeIsWholePlan({ selectedKeys: ["team"], planId: "team" }),
		).toBe(true);
		expect(
			planScopeIncludesVersion({
				selectedKeys: ["team:2"],
				planId: "team",
				version: 2,
			}),
		).toBe(true);
		expect(
			planScopePinnedVersions({
				selectedKeys: ["team:2", "team:1", "eu:3"],
				planId: "team",
			}),
		).toEqual([1, 2]);
	});

	test("labels the row by scope", () => {
		expect(planScopeLabel({ selectedKeys: ["team"], planId: "team" })).toBe(
			"All versions",
		);
		expect(
			planScopeLabel({ selectedKeys: ["team:1", "team:2"], planId: "team" }),
		).toBe("v1, v2");
		expect(planScopeLabel({ selectedKeys: [], planId: "team" })).toBe("None");
	});

	test("collapses a fully pinned plan to the whole-plan key", () => {
		expect(
			collapseFullyPinnedPlan({
				selectedKeys: ["team:1", "team:2"],
				planId: "team",
				versions: [1, 2],
			}),
		).toEqual(["team"]);
		expect(
			collapseFullyPinnedPlan({
				selectedKeys: ["team:2"],
				planId: "team",
				versions: [1, 2],
			}),
		).toEqual(["team:2"]);
	});
});
