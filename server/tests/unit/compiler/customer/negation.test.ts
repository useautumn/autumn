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

const ITEM_FROM = [
	"customer_entitlements ce",
	"JOIN entitlements e ON e.id = ce.entitlement_id",
	"LEFT JOIN prices pr ON pr.entitlement_id = e.id",
	"LEFT JOIN customer_prices cpr ON cpr.price_id = pr.id AND cpr.customer_product_id = ce.customer_product_id",
].join(" ");

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// `$none` is how the dashboard's "is not" / "not in" operators compile. It must
// emit NOT EXISTS so a Free+Pro customer is excluded from "plan is not free" —
// the per-plan `p.id <> free` (EXISTS) form would leak them in via Pro.
describe("compileFilter — customer / negation ($none)", () => {
	test("plan_id $none → NOT EXISTS over plans", () => {
		const result = compileFilter({
			filter: { plan: { $none: { plan_id: "free" } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND NOT EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND p.id = ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"free",
		]);
	});

	test("plan_id $none with $in → NOT EXISTS with IN list", () => {
		const result = compileFilter({
			filter: { plan: { $none: { plan_id: { $in: ["free", "trial"] } } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND NOT EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND p.id IN (?, ?)
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"free",
			"trial",
		]);
	});

	test("feature $none → NOT EXISTS over plans with nested item EXISTS", () => {
		const result = compileFilter({
			filter: { plan: { $none: { item: { feature_id: "credits" } } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND NOT EXISTS (
					SELECT 1
					FROM customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id
					WHERE cp.internal_customer_id = c.internal_id
						AND ${PLAN_AMBIENT}
						AND EXISTS (
							SELECT 1
							FROM ${ITEM_FROM}
							WHERE ce.customer_product_id = cp.id
								AND e.internal_feature_id = ?
						)
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"fea_credits_internal",
		]);
	});
});
