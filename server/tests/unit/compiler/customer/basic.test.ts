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

const BASE_PRICE_EXISTS = [
	"(SELECT base_cpr.id FROM customer_prices base_cpr",
	"JOIN prices base_pr ON base_pr.id = base_cpr.price_id",
	"WHERE base_cpr.customer_product_id = cp.id",
	"AND base_pr.entitlement_id IS NULL LIMIT 1)",
].join(" ");

describe("compileFilter — customer / basic plan-level filters", () => {
	test("customer.customer_id $in", () => {
		const result = compileFilter({
			filter: { customer_id: { $in: ["cus_a", "cus_b"] } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`${ROOT_AMBIENT} AND c.id IN (?, ?)`),
		);
		expect(result.params).toEqual(["org_test", "live", "cus_a", "cus_b"]);
	});

	test("plan.plan_id eq", () => {
		const result = compileFilter({
			filter: { plan: { plan_id: "pro" } },
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
						AND p.id = ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"pro",
		]);
	});

	test("plan.addon false", () => {
		const result = compileFilter({
			filter: { plan: { addon: false } },
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
						AND p.is_add_on = ?
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			false,
		]);
	});

	test("paid plan — plan.price: { $ne: null }", () => {
		const result = compileFilter({
			filter: { plan: { price: { $ne: null } } },
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
						AND ${BASE_PRICE_EXISTS} IS NOT NULL
				)
			`),
		);
		expect(result.params).toEqual(["org_test", "live", ...PLAN_AMBIENT_PARAMS]);
	});

	test("free plan — plan.price: null (bare)", () => {
		const result = compileFilter({
			filter: { plan: { price: null } },
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
						AND ${BASE_PRICE_EXISTS} IS NULL
				)
			`),
		);
		expect(result.params).toEqual(["org_test", "live", ...PLAN_AMBIENT_PARAMS]);
	});

	test("plan.plan_id $in", () => {
		const result = compileFilter({
			filter: { plan: { plan_id: { $in: ["pro", "team"] } } },
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
						AND p.id IN (?, ?)
				)
			`),
		);
		expect(result.params).toEqual([
			"org_test",
			"live",
			...PLAN_AMBIENT_PARAMS,
			"pro",
			"team",
		]);
	});
});
