import { describe, expect, test } from "bun:test";
import {
	buildCustomerCount,
	buildCustomerSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const ctx = { features: [] };

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("migration customer select planner wiring", () => {
	test("plan_id filters use a planned customer source plus fallback predicate", () => {
		const query = buildCustomerCount({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
		});
		const { sql, params } = dialect.sqlToQuery(query);

		expect(normalize(sql)).toContain(
			"FROM (WITH plan_products AS MATERIALIZED",
		);
		expect(normalize(sql)).toContain("SELECT p.internal_id FROM products p");
		expect(normalize(sql)).toContain(
			"AND EXISTS (SELECT 1 FROM customer_products cp JOIN products p",
		);
		expect(params).toEqual([
			"org_test",
			"live",
			"enterprise",
			"active",
			"past_due",
			"scheduled",
			"org_test",
			"live",
			"org_test",
			"live",
			"active",
			"past_due",
			"scheduled",
			"enterprise",
		]);
	});

	test("non-planned filters keep the customer root source", () => {
		const query = buildCustomerSelect({
			orgId: "org_test",
			env: "live",
			filter: { customer_id: "cus_123" },
			ctx,
			limit: 10,
		});
		const { sql, params } = dialect.sqlToQuery(query);

		expect(normalize(sql)).toContain("FROM customers c");
		expect(normalize(sql)).not.toContain("FROM (SELECT DISTINCT");
		expect(params).toEqual(["org_test", "live", "cus_123", 10]);
	});

	test("customer list filters are applied in the select SQL", () => {
		const query = buildCustomerSelect({
			orgId: "org_test",
			env: "live",
			filter: { customer_id: "cus_123" },
			ctx,
			customerFilters: {
				status: ["active"],
				version: ["pro:1"],
				processor: ["stripe"],
			},
		});
		const { sql } = dialect.sqlToQuery(query);
		const normalized = normalize(sql);

		expect(normalized).toContain("c.processor->>'id' IS NOT NULL");
		expect(normalized).toContain("FROM customer_products cp_dash");
		expect(normalized).toContain("AND c.internal_id IN");
		expect(normalized).toContain("cp_dash.internal_product_id IN");
		expect(normalized).toContain("FROM products p_lookup");
	});
});
