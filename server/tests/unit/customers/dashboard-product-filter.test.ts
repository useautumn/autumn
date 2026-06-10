import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	getCustomerListFilterSql,
	parseDashboardVersionFilter,
} from "@/internal/customers/getFullCusQuery.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const render = (filter: ReturnType<typeof getCustomerListFilterSql>) =>
	dialect.sqlToQuery(sql`SELECT * FROM customers c WHERE true ${filter}`);

describe("dashboard product filters", () => {
	test("parses numbered and custom product version selections", () => {
		expect(
			parseDashboardVersionFilter([
				"pro:2",
				"pro:custom",
				"",
				"missing-version",
				"bad:not-a-number",
			]),
		).toEqual([
			{ productId: "pro", version: 2 },
			{ productId: "pro", custom: true },
		]);
	});

	test("custom plan selection filters customer_products.is_custom", () => {
		const { sql: query, params } = render(
			getCustomerListFilterSql({
				productVersionFilters: [{ productId: "pro", custom: true }],
			}),
		);

		expect(normalize(query)).toContain("cp_dash.product_id = $3");
		expect(normalize(query)).toContain("cp_dash.is_custom = true");
		expect(normalize(query)).not.toContain("JOIN products p_dash");
		expect(params).toEqual(["active", "past_due", "pro"]);
	});

	test("custom and numbered selections share the product filter group", () => {
		const { sql: query, params } = render(
			getCustomerListFilterSql({
				productVersionFilters: [
					{ productId: "pro", version: 2 },
					{ productId: "pro", custom: true },
				],
			}),
		);

		const normalized = normalize(query);
		expect(normalized).toContain("JOIN products p_dash");
		expect(normalized).toContain("p_dash.version = $4");
		expect(normalized).toContain("cp_dash.is_custom = true");
		expect(params).toEqual(["active", "past_due", "pro", 2, "pro"]);
	});
});
