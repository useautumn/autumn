import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { billingCycleAnchorsSql } from "../../../src/customerProducts/repos/getBillingCycleAnchors.js";

const dialect = new PgDialect();

describe("billingCycleAnchorsSql", () => {
	test("binds the plan ids and the tenant, and reads the anchor off the first subscription id", () => {
		const query = dialect.sqlToQuery(
			billingCycleAnchorsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerProductIds: ["cp_1", "cp_2"],
			}),
		);
		expect(query.params).toEqual(["cp_1,cp_2", "org_1", "sandbox"]);
		expect(query.sql).toContain("s.stripe_id = cp.subscription_ids[1]");
		expect(query.sql).toContain("billing_cycle_anchor_seconds IS NOT NULL");
	});
});
