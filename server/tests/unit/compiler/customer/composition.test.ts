import { describe, expect, test } from "bun:test";
import type { Feature } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const features: Feature[] = [
	{ id: "credits", internal_id: "fea_credits_internal" } as Feature,
];

const ctx = contexts.create({ features });
const ambient = { orgId: "org_test", env: "live" };

const ROOT_AMBIENT = "c.org_id = ? AND c.env = ?";
const PLAN_AMBIENT = "cp.status IN (?, ?, ?)";
const PLAN_AMBIENT_PARAMS = ["active", "past_due", "scheduled"];

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

const planExists = (predicate: string) =>
	`EXISTS (
		SELECT 1
		FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
		WHERE cp.internal_customer_id = c.internal_id
			AND ${PLAN_AMBIENT}
			AND ${predicate}
	)`;

// Customer-level `$and` / `$or` compose INDEPENDENT plan quantifiers. "has free
// AND has pro" must be two separate EXISTS — a single plan can't be both, so
// merging them into one quantifier would drop a condition.
describe("compileFilter — customer / composition ($and, $or)", () => {
	test("$and → two independent EXISTS, AND'd", () => {
		const result = compileFilter({
			filter: {
				$and: [
					{ plan: { plan_id: "free" } },
					{ plan: { plan_id: { $in: ["pro_6mo", "pro_3mo"] } } },
				],
			},
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND (
					${planExists("p.id = ?")}
					AND
					${planExists("p.id IN (?, ?)")}
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"free",
			...PLAN_AMBIENT_PARAMS,
			"pro_6mo",
			"pro_3mo",
		]);
	});

	test("$or → two independent EXISTS, OR'd", () => {
		const result = compileFilter({
			filter: {
				$or: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
			},
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND (
					${planExists("p.id = ?")}
					OR
					${planExists("p.id = ?")}
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"free",
			...PLAN_AMBIENT_PARAMS,
			"pro",
		]);
	});

	test("plan_id + version stay bound inside one EXISTS", () => {
		const result = compileFilter({
			filter: { plan: { plan_id: "pro", version: 2 } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(
				`${ROOT_AMBIENT} AND ${planExists("(p.id = ? AND p.version = ?)")}`,
			),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"pro",
			2,
		]);
	});
});
