import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { sharedCatalogRowsSql } from "../../../src/catalog/repos/getSharedCatalogRows/sharedCatalogRowsSql.js";

describe("sharedCatalogRowsSql", () => {
	test("leaves out every row that is one customer's own, plan licenses included", () => {
		const { sql, params } = new PgDialect().sqlToQuery(
			sharedCatalogRowsSql({ ctx: { orgId: "org_1", env: "sandbox" } }),
		);

		expect(sql).toContain("e.is_custom IS NOT TRUE");
		expect(sql).toContain("pr.is_custom IS NOT TRUE");
		expect(sql).toContain("ft.is_custom IS NOT TRUE");
		// A custom plan license is reachable only through its customer's pool; that customer's push carries it.
		expect(sql).toContain(
			"SELECT id FROM plan_license WHERE is_custom IS NOT TRUE",
		);
		expect(params).toEqual(expect.arrayContaining(["org_1", "sandbox"]));
	});
});
