/**
 * Contract: how `$or` expands into per-patch disjuncts.
 *
 *   - no $or → one disjunct: the filter itself;
 *   - $or → one disjunct per branch, sibling fields carried as a conjunct
 *     alongside each branch (they AND with it);
 *   - nested $or expands recursively, accumulating conjuncts;
 *   - `$or: []` → no disjuncts (matches nothing).
 */

import { describe, expect, test } from "bun:test";
import { expandPlanFilterDisjuncts } from "@/internal/migrations/v2/batchOperations/scope/utils/expandPlanFilterDisjuncts.js";

describe("expandPlanFilterDisjuncts", () => {
	test("no $or → single disjunct", () => {
		expect(expandPlanFilterDisjuncts({ plan_id: "pro", custom: true })).toEqual(
			[[{ plan_id: "pro", custom: true }]],
		);
	});

	test("$or branches each carry the sibling fields as a conjunct", () => {
		expect(
			expandPlanFilterDisjuncts({
				custom: false,
				$or: [{ plan_id: "a" }, { plan_id: "b", paid: true }],
			}),
		).toEqual([
			[{ custom: false }, { plan_id: "a" }],
			[{ custom: false }, { plan_id: "b", paid: true }],
		]);
	});

	test("nested $or expands recursively", () => {
		expect(
			expandPlanFilterDisjuncts({
				plan_id: "pro",
				$or: [{ $or: [{ version: 1 }, { version: 2 }] }, { custom: true }],
			}),
		).toEqual([
			[{ plan_id: "pro" }, {}, { version: 1 }],
			[{ plan_id: "pro" }, {}, { version: 2 }],
			[{ plan_id: "pro" }, { custom: true }],
		]);
	});

	test("$or: [] matches nothing", () => {
		expect(expandPlanFilterDisjuncts({ plan_id: "pro", $or: [] })).toEqual([]);
	});
});
