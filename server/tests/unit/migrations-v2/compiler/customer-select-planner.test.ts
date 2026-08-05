import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildCustomerCount,
	buildCustomerSelect,
	buildProcessedPreviewSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";

const dialect = new PgDialect();
const ctx = { features: [] };

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("migration customer select planner wiring", () => {
	test("plan-level counts aggregate off customer_products alone", () => {
		const query = buildCustomerCount({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
		});
		const { sql, params } = dialect.sqlToQuery(query);

		expect(normalize(sql)).toContain("FROM customer_products cp");
		expect(normalize(sql)).toContain("GROUP BY cp.internal_customer_id");
		expect(normalize(sql)).not.toContain("customers");
		expect(params).toEqual([
			"org_test",
			"live",
			"enterprise",
			"active",
			"past_due",
			"scheduled",
		]);
	});

	test("counts with search keep the batch-hash shape", () => {
		const query = buildCustomerCount({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
			search: "acme",
		});
		const { sql } = dialect.sqlToQuery(query);

		expect(normalize(sql)).toContain("WITH plan_products AS MATERIALIZED");
		expect(normalize(sql)).toContain("ILIKE");
	});

	test("consumed plan filter with a limit emits the streaming lateral walk", () => {
		const query = buildCustomerSelect({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
			checkpoint: {
				migrationInternalId: "mig_1",
				migrationRunId: "run_1",
				dryRun: false,
				excludedStatuses: ["succeeded"],
			},
			limit: 5000,
			afterInternalId: "cus_abc",
		});
		const { sql } = dialect.sqlToQuery(query);
		const normalized = normalize(sql);

		expect(normalized).toContain("CROSS JOIN LATERAL");
		expect(normalized).toContain(
			'DISTINCT ON (cp.internal_customer_id COLLATE "C")',
		);
		// Cursor + checkpoint live INSIDE the walk so the inner LIMIT is exact.
		expect(normalized).toContain('cp.internal_customer_id COLLATE "C" < $');
		expect(normalized).toContain("mir.item_id = cp.internal_customer_id");
		expect(normalized).not.toContain("WITH plan_products AS MATERIALIZED");
	});

	test("search and residual predicates move INSIDE the walk (pages stay exact)", () => {
		const withSearch = buildCustomerSelect({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
			search: "acme",
			limit: 5000,
		});
		const searchSql = normalize(dialect.sqlToQuery(withSearch).sql);
		expect(searchSql).toContain("CROSS JOIN LATERAL");
		// The search predicate must filter BEFORE the walk's LIMIT.
		const walkEnd = searchSql.indexOf(") walk ORDER BY");
		expect(
			searchSql.indexOf(
				"JOIN customers c ON c.internal_id = cp.internal_customer_id",
			),
		).toBeLessThan(walkEnd);
		expect(searchSql.indexOf("ILIKE")).toBeGreaterThan(-1);
		expect(searchSql.indexOf("ILIKE")).toBeLessThan(walkEnd);

		const withResidual = buildCustomerSelect({
			orgId: "org_test",
			env: "live",
			filter: { customer_id: "cus_123", plan: { plan_id: "enterprise" } },
			ctx,
			limit: 5000,
		});
		const residualSql = normalize(dialect.sqlToQuery(withResidual).sql);
		expect(residualSql).toContain("CROSS JOIN LATERAL");
		expect(residualSql.indexOf("c.id = $")).toBeLessThan(
			residualSql.indexOf(") walk ORDER BY"),
		);

		const withoutLimit = buildCustomerSelect({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
		});
		expect(normalize(dialect.sqlToQuery(withoutLimit).sql)).not.toContain(
			"CROSS JOIN LATERAL",
		);
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
		expect(params).toEqual([
			"org_test",
			"live",
			"cus_123",
			10,
			"org_test",
			"live",
		]);
	});

	test("preview mode 'all' takes the bounded union; status modes keep legacy", () => {
		const previewAll = buildProcessedPreviewSelect({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
			includeProcessed: { migrationInternalId: "mig_1" },
			limit: 51,
		});
		const allSql = normalize(dialect.sqlToQuery(previewAll).sql);
		expect(allSql).toContain("CROSS JOIN LATERAL");
		expect(allSql).toContain('DISTINCT ON (mir.item_id COLLATE "C")');
		expect(allSql).toContain("UNION");

		const previewStatuses = buildProcessedPreviewSelect({
			orgId: "org_test",
			env: "live",
			filter: { plan: { plan_id: "enterprise" } },
			ctx,
			includeProcessed: {
				migrationInternalId: "mig_1",
				executionFilter: { statuses: ["succeeded"] },
			},
			limit: 51,
		});
		const statusSql = normalize(dialect.sqlToQuery(previewStatuses).sql);
		expect(statusSql).not.toContain("CROSS JOIN LATERAL");
		expect(statusSql).toContain("c.internal_id IN ( SELECT mir.item_id");
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
