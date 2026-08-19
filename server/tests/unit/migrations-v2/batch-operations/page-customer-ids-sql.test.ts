import { describe, expect, test } from "bun:test";
import { EntInterval, type EntitlementWithFeature } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildAddCandidateRowsQuery } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { buildReplaceCandidateRowsQuery } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsForPage/selectReplaceCandidateRows.js";
import { buildLicenseCandidateRowsQuery } from "@/internal/migrations/v2/batchOperations/actions/selectLicenseCandidateRows.js";
import { pageCustomerIdsCte } from "@/internal/migrations/v2/batchOperations/actions/utils/pageCustomerIdsSql.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const entitlement = {
	id: "ent_to",
	interval: EntInterval.Month,
	interval_count: 1,
	internal_feature_id: "feat_internal",
	feature: { id: "emails", type: "metered" },
} as EntitlementWithFeature;

const scope = buildOperationScope({
	internalProductId: "prod_internal",
	isCustom: false,
});

const render = (query: Parameters<PgDialect["sqlToQuery"]>[0]) =>
	normalize(dialect.sqlToQuery(query).sql);

describe("pageCustomerIdsCte", () => {
	test("materializes unnest so ANY() cannot collapse to 1 row", () => {
		const sql = render(
			pageCustomerIdsCte({ internalCustomerIds: ["cus_1", "cus_2"] }),
		);

		expect(sql).toContain("page AS MATERIALIZED");
		expect(sql).toContain("unnest($1::text[])");
		expect(sql).not.toContain("= ANY");
	});
});

describe("page-scoped candidate selects", () => {
	test("replace drives from the page CTE, not ANY(customer ids)", () => {
		const sql = render(
			buildReplaceCandidateRowsQuery({
				internalCustomerIds: ["cus_1", "cus_2"],
				scope,
				entitlement,
				fromEntitlementIds: ["ent_from"],
				includeAnchorSources: true,
				limit: 10000,
			}),
		);

		expect(sql).toContain("page AS MATERIALIZED");
		expect(sql).toContain("FROM page");
		expect(sql).toContain(
			"INNER JOIN customer_products AS cp ON cp.internal_customer_id = page.internal_customer_id",
		);
		expect(sql).not.toMatch(/internal_customer_id = ANY/);
	});

	test("add drives from the page CTE, not ANY(customer ids)", () => {
		const sql = render(
			buildAddCandidateRowsQuery({
				internalCustomerIds: ["cus_1", "cus_2"],
				scope,
				entitlement,
				includeAnchorSources: true,
				limit: 10000,
			}),
		);

		expect(sql).toContain("page AS MATERIALIZED");
		expect(sql).toContain("FROM page");
		expect(sql).not.toMatch(/internal_customer_id = ANY/);
	});

	test("license add projects entitlement literals and EXISTS on the minted plan_license", () => {
		const sql = render(
			buildLicenseCandidateRowsQuery({
				internalCustomerIds: ["cus_1", "cus_2"],
				scope,
				entitlement,
				licensePlanId: "plan_license_1",
				limit: 10000,
				match: "add",
			}),
		);

		expect(sql).toContain("page AS MATERIALIZED");
		expect(sql).toContain("FROM page");
		expect(sql).toMatch(/\$\d+ AS "entitlementId"/);
		expect(sql).toMatch(/\$\d+ AS "internalFeatureId"/);
		expect(sql).toMatch(/\$\d+ AS "featureId"/);
		expect(sql).toContain("FROM license_entitlements AS le");
		expect(sql).toContain("le.plan_license_id = pool.plan_license_id");
		expect(sql).toContain("le.entitlement_id = $");
		expect(sql).toContain("NOT EXISTS");
		expect(sql).not.toContain("INNER JOIN license_entitlements");
		expect(sql).not.toMatch(/INNER JOIN entitlements AS e ON/);
		expect(sql).not.toMatch(/INNER JOIN features AS f ON/);
		expect(sql).not.toMatch(/internal_customer_id = ANY/);
	});
});
