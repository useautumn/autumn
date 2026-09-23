import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { catalogRowsSql } from "../../../src/catalog/repos/getCatalogRows/catalogRowsSql.js";

describe("catalogRowsSql", () => {
	test("binds every id list as one jsonb parameter and keeps the text stable", () => {
		const dialect = new PgDialect();
		const first = dialect.sqlToQuery(
			catalogRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				ids: {
					entitlementIds: ["ent_1", "ent_2"],
					productInternalIds: ["prod_1"],
					featureInternalIds: ["feat_1"],
					priceIds: ["price_1"],
					planLicenseIds: ["pl_1"],
				},
			}),
		);
		const second = dialect.sqlToQuery(
			catalogRowsSql({
				ctx: { orgId: "org_2", env: "live" },
				ids: {
					entitlementIds: [],
					productInternalIds: [],
					featureInternalIds: ["feat_9"],
					priceIds: [],
					planLicenseIds: [],
				},
			}),
		);

		// Each id list is one jsonb parameter: Bun's driver would flatten a JS array to "a,b".
		expect(first.params).toEqual([
			"org_1",
			'["ent_1","ent_2"]',
			"org_1",
			"sandbox",
			'["prod_1"]',
			"org_1",
			"sandbox",
			'["feat_1"]',
			"org_1",
			'["price_1"]',
			"org_1",
			"sandbox",
			'["pl_1"]',
		]);
		expect(first.sql).toContain("jsonb_array_elements_text($2::text::jsonb)");
		expect(first.sql).toBe(second.sql);
		expect(first.sql).not.toContain("org_1");
	});
});
