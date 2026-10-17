/**
 * Save-time dry evaluation (Stage 3, D2a): a filter is walked through the evaluator's field
 * registry, and anything it would treat as unsupported is an issue before the rule is saved.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleFilter } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { findUnevaluableConditions } from "@/internal/approvals/utils/findUnevaluableConditions.js";

const attach = (filter: unknown) =>
	findUnevaluableConditions({
		actions: ["billing.attach"],
		filter: filter as ApprovalRuleFilter,
	});

describe("findUnevaluableConditions", () => {
	test("every PRD example rule evaluates", () => {
		for (const rule of rules.prdExamples()) {
			expect(
				findUnevaluableConditions({
					actions: rule.actions,
					filter: rule.filter,
				}),
			).toEqual([]);
		}
		expect(attach(null)).toEqual([]);
		expect(attach({ incoming: { $some: { free_trial: null } } })).toEqual([]);
	});

	test("a key from another area is unsupported", () => {
		expect(attach({ cancel_action: "cancel_immediately" })).toEqual([
			{
				path: "filter.cancel_action",
				message: expect.stringContaining("cancel_action"),
			},
		]);
	});

	test("empty groups and unknown keys inside arrays and groups are unsupported", () => {
		expect(attach({ $or: [] }).map((issue) => issue.path)).toEqual([
			"filter.$or",
		]);
		expect(
			attach({
				$and: [{ paid: true }, { incoming: { $some: { mystery: 1 } } }],
			}).map((issue) => issue.path),
		).toEqual(["filter.$and.1.incoming.$some.mystery"]);
	});
});
