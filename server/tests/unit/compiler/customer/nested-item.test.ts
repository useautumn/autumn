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

describe("compileFilter — customer / nested item filters", () => {
	test("plan.item.feature_id eq — resolves through entitlements", () => {
		const result = compileFilter({
			filter: { plan: { item: { feature_id: "credits" } } },
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

	test("paid credits — uses paid-side join from customer_prices", () => {
		const result = compileFilter({
			filter: {
				plan: { item: { feature_id: "credits", price: { $ne: null } } },
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
							FROM customer_prices cpr JOIN prices pr ON pr.id = cpr.price_id JOIN entitlements e ON e.id = pr.entitlement_id
							WHERE cpr.customer_product_id = cp.id
								AND (e.internal_feature_id = ? AND cpr.id IS NOT NULL)
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

	test("free credits — feature_id + price: null (bare)", () => {
		const result = compileFilter({
			filter: { plan: { item: { feature_id: "credits", price: null } } },
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
								AND (e.internal_feature_id = ? AND cpr.id IS NULL)
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

	test("plan_id + nested item.feature_id — AND on plan scope", () => {
		const result = compileFilter({
			filter: {
				plan: { plan_id: "pro", item: { feature_id: "credits" } },
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
						AND (
							p.id = ?
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
			...PLAN_AMBIENT_PARAMS,
			"pro",
			"fea_credits_internal",
		]);
	});

	test("unknown feature_id throws at parse", () => {
		expect(() =>
			compileFilter({
				filter: { plan: { item: { feature_id: "nonexistent" } } },
				ctx: { features: ctx.features },
				ambient,
			}),
		).toThrow("Unknown feature_id: nonexistent");
	});
});
