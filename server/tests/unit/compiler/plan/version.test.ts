/**
 * TDD coverage for PlanFilter.version (NumberMatcher).
 *
 * Contract under test:
 *   Filter:
 *     - PlanFilter.version accepts bare number (eq), $eq, $ne, $in, $gt,
 *       $gte, $lt, $lte.
 *   Compilation:
 *     - Customer-rooted: emits `p.version <op> ?` inside the planScope
 *       EXISTS subquery.
 *     - Plan-rooted: emits `p.version <op> ?` at the root.
 */

import { describe, expect, test } from "bun:test";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import { compilePlanFilter } from "@autumn/shared/api/migrations/compiler/compilePlanFilter.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const ctx = contexts.create({ features: [] });
const ambient = { orgId: "org_test", env: "live" };

const ROOT_AMBIENT = "c.org_id = ? AND c.env = ?";
const PLAN_AMBIENT = "cp.status IN (?, ?)";
const PLAN_AMBIENT_PARAMS = ["active", "past_due"];
const PLAN_ROOT_AMBIENT = "p.org_id = ? AND p.env = ?";

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("PlanFilter.version — customer-rooted compilation", () => {
	test("plan.version bare number eq", () => {
		const result = compileFilter({
			filter: { plan: { version: 1 } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND p.version = ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			1,
		]);
	});

	test("plan.version $gte", () => {
		const result = compileFilter({
			filter: { plan: { version: { $gte: 2 } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND p.version >= ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			2,
		]);
	});

	test("plan.version $lt", () => {
		const result = compileFilter({
			filter: { plan: { version: { $lt: 3 } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND p.version < ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			3,
		]);
	});

	test("plan.version $in", () => {
		const result = compileFilter({
			filter: { plan: { version: { $in: [1, 2] } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND p.version IN (?, ?)
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			1,
			2,
		]);
	});

	test("plan.version combined $gte + $lte (range)", () => {
		const result = compileFilter({
			filter: { plan: { version: { $gte: 2, $lte: 4 } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND (p.version >= ? AND p.version <= ?)
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			2,
			4,
		]);
	});
});

describe("PlanFilter.version — plan-rooted compilation", () => {
	test("version bare number eq", () => {
		const result = compilePlanFilter({
			filter: { version: 2 },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`${PLAN_ROOT_AMBIENT} AND p.version = ?`),
		);
		expect(result.params).toEqual(["org_test", "live", 2]);
	});

	test("version $gt", () => {
		const result = compilePlanFilter({
			filter: { version: { $gt: 1 } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`${PLAN_ROOT_AMBIENT} AND p.version > ?`),
		);
		expect(result.params).toEqual(["org_test", "live", 1]);
	});
});
