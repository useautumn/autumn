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

const BASE_PRICE_EXISTS = [
	"(SELECT base_cpr.id FROM customer_prices base_cpr",
	"JOIN prices base_pr ON base_pr.id = base_cpr.price_id",
	"WHERE base_cpr.customer_product_id = cp.id",
	"AND base_pr.entitlement_id IS NULL LIMIT 1)",
].join(" ");

const PAID_EXISTS =
	"EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id)";

const RECURRING_EXISTS = [
	"EXISTS (SELECT 1 FROM customer_prices cpr",
	"JOIN prices pr ON pr.id = cpr.price_id",
	"WHERE cpr.customer_product_id = cp.id",
	"AND pr.config->>'interval' <> 'one_off')",
].join(" ");

const ITEM_PAID_FROM = [
	"customer_prices cpr",
	"JOIN prices pr ON pr.id = cpr.price_id",
	"JOIN entitlements e ON e.id = pr.entitlement_id",
].join(" ");

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("compileFilter — derived boolean filters", () => {
	test("plan.paid: true → EXISTS over customer_prices", () => {
		const result = compileFilter({
			filter: { plan: { paid: true } },
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
						AND ${PAID_EXISTS} = ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			true,
		]);
	});

	test("plan.paid: false → EXISTS = false (i.e. no customer_prices)", () => {
		const result = compileFilter({
			filter: { plan: { paid: false } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			false,
		]);
	});

	test("plan.recurring: true → EXISTS with interval <> 'one_off'", () => {
		const result = compileFilter({
			filter: { plan: { recurring: true } },
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
						AND ${RECURRING_EXISTS} = ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			true,
		]);
	});
});

describe("compileFilter — $or operator on plan", () => {
	test("$or: [{ price: $ne: null }, { item.price: $ne: null }] — base OR paid item", () => {
		const result = compileFilter({
			filter: {
				plan: {
					$or: [{ price: { $ne: null } }, { item: { price: { $ne: null } } }],
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
						AND (
							${BASE_PRICE_EXISTS} IS NOT NULL
							OR EXISTS (
								SELECT 1
								FROM ${ITEM_PAID_FROM}
								WHERE cpr.customer_product_id = cp.id
									AND cpr.id IS NOT NULL
							)
						)
				)
			`),
		);
		expect(result.params).toEqual(["org_test", "live", ...PLAN_AMBIENT_PARAMS]);
	});

	test("$or alongside sibling field — sibling is AND'd with the OR group", () => {
		const result = compileFilter({
			filter: {
				plan: {
					plan_id: "pro",
					$or: [{ paid: true }, { recurring: true }],
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
						AND (
							p.id = ?
							AND (${PAID_EXISTS} = ? OR ${RECURRING_EXISTS} = ?)
						)
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"pro",
			true,
			true,
		]);
	});

	test("empty $or array throws", () => {
		expect(() =>
			compileFilter({
				filter: { plan: { $or: [] } },
				ctx: { features: ctx.features },
				ambient,
			}),
		).toThrow("$or requires at least one branch");
	});
});
