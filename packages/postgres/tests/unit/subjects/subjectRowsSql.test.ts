import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { SUBJECT_ROW_LIMITS } from "../../../src/subjects/repos/getSubjectRows/subjectRowLimits.js";
import { subjectRowsSql } from "../../../src/subjects/repos/getSubjectRows/subjectRowsSql.js";

const dialect = new PgDialect();

describe("subjectRowsSql", () => {
	test("binds every input as a parameter and keeps the text stable", () => {
		const first = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: null,
				statuses: ["active", "past_due"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		const second = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_2", env: "live" },
				customerId: "cus_2",
				entityId: null,
				statuses: ["active"],
				asOfTimestampMs: 1_800_000_000_000,
			}),
		);

		expect(first.params).toEqual([
			"org_1",
			"sandbox",
			"cus_1",
			"cus_1",
			"cus_1",
			null,
			null,
			null,
			"active,past_due",
			"active,past_due",
			SUBJECT_ROW_LIMITS.customerProducts,
			1_700_000_000_000,
			SUBJECT_ROW_LIMITS.looseCustomerEntitlements,
			"active,past_due",
			1_700_000_000_000,
			SUBJECT_ROW_LIMITS.pooledCustomerEntitlements,
			1_700_000_000_000,
		]);
		expect(first.sql).toBe(second.sql);
		expect(first.sql).not.toContain("org_1");
	});

	test("a customer subject keeps customer-level rows, an entity subject keeps the entity's own rows", () => {
		const customerQuery = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: null,
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		const entityQuery = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: "ent_42",
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);

		expect(customerQuery.sql).toContain("cp.internal_entity_id IS NULL");
		expect(customerQuery.sql).toContain("ce.internal_entity_id IS NULL");
		expect(entityQuery.sql).toContain(
			"cp.internal_entity_id IN (SELECT internal_id FROM entity_record)",
		);
		expect(entityQuery.sql).toContain(
			"ce.internal_entity_id IN (SELECT internal_id FROM entity_record)",
		);
		expect(entityQuery.params).toContain("ent_42");
	});
});

describe("subjectRowsSql: pooled balances", () => {
	test("the pool behind pooled plan items is loaded with its pooled_balances row; its sources are not", () => {
		const { sql } = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: "ent_42",
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);

		// The pool is a customer-level row: only the customer's own load carries it, an entity command reads the customer's copy.
		expect(sql).toContain("pooled_customer_entitlements AS (");
		expect(sql).toContain("WHERE FALSE\n\t\t\tAND ce.internal_customer_id");
		expect(
			dialect.sqlToQuery(
				subjectRowsSql({
					ctx: { orgId: "org_1", env: "sandbox" },
					customerId: "cus_1",
					entityId: null,
					statuses: ["active"],
					asOfTimestampMs: 1_700_000_000_000,
				}),
			).sql,
		).toContain("WHERE TRUE\n\t\t\tAND ce.internal_customer_id");
		expect(sql).toContain(
			"JOIN pooled_balances pb ON pb.id = ce.pooled_balance_id",
		);
		expect(sql).toContain("AND ce.pooled_balance_id IS NOT NULL");
		expect(sql).toContain("AND ce.pooled_contribution_id IS NULL");
		// A license pool is served while its parent is live, like a seat.
		expect(sql).toContain(
			"pb.customer_license_link_id IS NULL\n\t\t\t\tOR EXISTS (",
		);
		expect(sql).toContain("WHERE cl.link_id = pb.customer_license_link_id");
		expect(sql).toContain("SELECT * FROM pooled_customer_entitlements");
		expect(sql).toContain("'pooled_balances', COALESCE(");
		// A contributing source is a product row like any other: it is held at balance 0 so a plan can zero or release it.
		expect(sql).toContain(
			"JOIN subject_customer_products cp ON cp.id = ce.customer_product_id\n\t\tWHERE ce.pooled_balance_id IS NULL\n\t),",
		);
		// Product and loose rows still leave every pooled row out.
		expect(sql.match(/ce\.pooled_balance_id IS NULL/g)).toHaveLength(2);
	});
});

describe("subjectRowsSql: seats", () => {
	test("a product is kept by its own status, a seat by its license parent's; the seat's own status column is never read", () => {
		const { sql } = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: "ent_42",
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		expect(sql).toContain(
			"(cp.customer_license_link_id IS NULL AND cp.status = ANY(string_to_array($9, ',')))",
		);
		expect(sql).toContain(
			"JOIN customer_products parent ON parent.id = cl.parent_customer_product_id",
		);
		expect(sql).toContain("WHERE cl.link_id = cp.customer_license_link_id");
		expect(sql).toContain("AND parent.status = ANY(string_to_array($10, ','))");
		// A spare seat has no holder to draw from it, live parent or not.
		expect(sql).toContain(
			"cp.internal_entity_id IS NOT NULL\n\t\t\t\t\tAND EXISTS (",
		);
		expect(sql.match(/cp\.status/g)).toHaveLength(1);
		expect(sql.match(/parent\.status = ANY/g)).toHaveLength(2);
	});
});

describe("subjectRowsSql: limits", () => {
	test("products, loose grants and pools are each capped at the newest rows, prices and grants following the survivors", () => {
		const { sql, params } = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: null,
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		// Legacy's rank under the cap: priced before free, main before add-on, newest first.
		expect(sql).toContain(
			"EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id) DESC,\n\t\t\tprod.is_add_on ASC,\n\t\t\tcp.created_at DESC\n\t\tLIMIT $",
		);
		expect(sql.match(/ORDER BY ce\.id DESC\n\t\tLIMIT \$/g)).toHaveLength(2);
		expect(params.filter((param) => param === 200)).toEqual([
			SUBJECT_ROW_LIMITS.customerProducts,
			SUBJECT_ROW_LIMITS.looseCustomerEntitlements,
			SUBJECT_ROW_LIMITS.pooledCustomerEntitlements,
		]);
		expect(sql).toContain(
			"WHERE cpr.customer_product_id IN (SELECT id FROM subject_customer_products)",
		);
		expect(sql).toContain(
			"WHERE rep.cus_ent_id IN (SELECT id FROM all_customer_entitlements)",
		);
	});
});
