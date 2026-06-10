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

const ITEM_PAID_FROM =
	"customer_prices cpr JOIN prices pr ON pr.id = cpr.price_id JOIN entitlements e ON e.id = pr.entitlement_id";

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("compileFilter — plan.item.rollover existence", () => {
	test("rollover: { $ne: null } — IS NOT NULL", () => {
		const result = compileFilter({
			filter: { plan: { item: { rollover: { $ne: null } } } },
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
						AND EXISTS (
							SELECT 1
							FROM ${ITEM_FROM}
							WHERE ce.customer_product_id = cp.id
								AND e.rollover IS NOT NULL
						)
				)
			`),
		);
		expect(result.params).toEqual(["org_test", "live", ...PLAN_AMBIENT_PARAMS]);
	});

	test("rollover: null (bare) — IS NULL", () => {
		const result = compileFilter({
			filter: { plan: { item: { rollover: null } } },
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
						AND EXISTS (
							SELECT 1
							FROM ${ITEM_FROM}
							WHERE ce.customer_product_id = cp.id
								AND e.rollover IS NULL
						)
				)
			`),
		);
		expect(result.params).toEqual(["org_test", "live", ...PLAN_AMBIENT_PARAMS]);
	});

	test("feature_id + rollover — AND'd inside item scope", () => {
		const result = compileFilter({
			filter: {
				plan: {
					item: { feature_id: "credits", rollover: { $ne: null } },
				},
			},
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
						AND EXISTS (
							SELECT 1
							FROM ${ITEM_FROM}
							WHERE ce.customer_product_id = cp.id
								AND (e.internal_feature_id = ? AND e.rollover IS NOT NULL)
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

	test("rollover works alongside paid-only scope variant", () => {
		const result = compileFilter({
			filter: {
				plan: {
					item: { price: { $ne: null }, rollover: { $ne: null } },
				},
			},
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
						AND EXISTS (
							SELECT 1
							FROM ${ITEM_PAID_FROM}
							WHERE cpr.customer_product_id = cp.id
								AND (cpr.id IS NOT NULL AND e.rollover IS NOT NULL)
						)
				)
			`),
		);
		expect(result.params).toEqual(["org_test", "live", ...PLAN_AMBIENT_PARAMS]);
	});

	test("nested-field filtering on rollover throws", () => {
		expect(() =>
			compileFilter({
				filter: {
					plan: { item: { rollover: { max: { $ne: null } } as never } },
				},
				ctx: { features: ctx.features },
				ambient,
			}),
		).toThrow(
			"plan.item.rollover filtering on nested fields is not supported in phase 1",
		);
	});
});

describe("compileFilter — customer.item shortcut", () => {
	test("customer.item.X compiles identically to customer.plan.item.X", () => {
		const shortcut = compileFilter({
			filter: { item: { rollover: { $ne: null } } },
			ctx: { features: ctx.features },
			ambient,
		});

		const full = compileFilter({
			filter: { plan: { item: { rollover: { $ne: null } } } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(shortcut.sql)).toBe(normalize(full.sql));
		expect(shortcut.params).toEqual(full.params);
	});

	test("customer.item AND'd with sibling customer_id", () => {
		const result = compileFilter({
			filter: {
				customer_id: "cus_x",
				item: { feature_id: "credits" },
			},
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`
				${ROOT_AMBIENT} AND (
					c.id = ?
					AND EXISTS (
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
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			"cus_x",
			...PLAN_AMBIENT_PARAMS,
			"fea_credits_internal",
		]);
	});

	test("customer.item sibling with customer.plan — both AND'd", () => {
		const result = compileFilter({
			filter: {
				plan: { plan_id: "pro" },
				item: { feature_id: "credits" },
			},
			ctx: { features: ctx.features },
			ambient,
		});

		// Two separate plan-EXISTS clauses — one for `plan_id`, one wrapping
		// the item shortcut. AND'd at customer scope.
		expect(normalize(result.sql)).toContain("p.id = ?");
		expect(normalize(result.sql)).toContain("e.internal_feature_id = ?");
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"pro",
			...PLAN_AMBIENT_PARAMS,
			"fea_credits_internal",
		]);
	});
});
