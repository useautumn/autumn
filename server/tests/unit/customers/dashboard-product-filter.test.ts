import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusSearchService } from "@/internal/customers/CusSearchService.js";
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

	/** Red: numbered plan search joined globally; green: products are scoped to the requesting org and environment. */
	test("numbered plan cursor lookup scopes the product join", async () => {
		let capturedQuery: ReturnType<PgDialect["sqlToQuery"]> | undefined;
		const db = {
			execute: async (query: SQL) => {
				capturedQuery = dialect.sqlToQuery(query);
				return [];
			},
		} as unknown as DrizzleCli;

		await CusSearchService.resolveInternalIdsByCursor({
			db,
			orgId: "org_target",
			env: AppEnv.Live,
			search: "",
			filters: { version: ["enterprise:1"] },
			limit: 50,
		});

		const query = normalize(capturedQuery!.sql);
		expect(query).toContain('"products"."org_id" =');
		expect(query).toContain('"products"."env" =');
	});
});
